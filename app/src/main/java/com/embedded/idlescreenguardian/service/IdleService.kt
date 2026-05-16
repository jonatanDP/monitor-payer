package com.embedded.idlescreenguardian.service

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.ActivityManager
import android.app.ForegroundServiceStartNotAllowedException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import com.embedded.idlescreenguardian.R
import com.embedded.idlescreenguardian.common.AppConstants
import com.embedded.idlescreenguardian.common.IdleMode
import com.embedded.idlescreenguardian.network.CommandFetchResult
import com.embedded.idlescreenguardian.network.NetworkClient
import com.embedded.idlescreenguardian.network.RemoteCommand
import com.embedded.idlescreenguardian.receiver.ServiceWatchdogReceiver
import com.embedded.idlescreenguardian.ui.KioskLauncherActivity
import com.embedded.idlescreenguardian.utils.ScreenController
import com.embedded.idlescreenguardian.utils.SettingsManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

class IdleService : Service() {

    private val serviceLogTag = "IdleService"

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private lateinit var settingsManager: SettingsManager
    private lateinit var screenController: ScreenController
    private lateinit var networkClient: NetworkClient
    private lateinit var workerThread: HandlerThread
    private lateinit var workerHandler: Handler

    private var screenReceiverRegistered = false
    private var lockRunnableScheduled = false
    private var monitoringLoopScheduled = false
    private var backendSyncScheduled = false
    private var deviceRegisteredInBackend = false
    private var backendSyncJob: Job? = null
    private var currentNetworkDelayMs = AppConstants.NETWORK_BACKOFF_INITIAL_MS

    private val lockRunnable = Runnable {
        executeScreenLock("idle_timeout")
    }

    private val monitoringLoopRunnable = object : Runnable {
        override fun run() {
            monitoringLoopScheduled = false
            Log.d(serviceLogTag, "Monitoreando inactividad")
            checkIdleAndAct()
            if (settingsManager.isMonitoringEnabled()) {
                startMonitoringLoop()
            }
        }
    }

    private val backendSyncRunnable = object : Runnable {
        override fun run() {
            backendSyncScheduled = false
            launchBackendSync()
        }
    }

    private val watchdogRunnable = object : Runnable {
        override fun run() {
            if (!settingsManager.isMonitoringEnabled()) {
                Log.i(AppConstants.LOG_TAG, "Watchdog detiene el servicio porque monitoreo esta deshabilitado")
                stopSelf()
                return
            }

            settingsManager.setLastWatchdogHeartbeat(System.currentTimeMillis())
            scheduleRescueAlarm("watchdog_heartbeat")

            if (!lockRunnableScheduled) {
                Log.w(AppConstants.LOG_TAG, "Watchdog detecto timer inactivo. Restaurando estado.")
                restoreTimerFromPersistedState("watchdog")
            } else {
                Log.d(AppConstants.LOG_TAG, "Watchdog OK")
            }

            workerHandler.postDelayed(this, AppConstants.WATCHDOG_INTERVAL_MS)
        }
    }

    private val screenEventReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON,
                Intent.ACTION_USER_PRESENT -> {
                    Log.i(AppConstants.LOG_TAG, "Evento de pantalla recibido: ${intent.action}")
                    resetTimerInternal("system:${intent.action}", updateTimestamp = true)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        settingsManager = SettingsManager(applicationContext)
        screenController = ScreenController(applicationContext)
        networkClient = NetworkClient(applicationContext, settingsManager)
        workerThread = HandlerThread("IdleServiceWorker").apply { start() }
        workerHandler = Handler(workerThread.looper)

        createNotificationChannel()
        promoteToForeground(getString(R.string.notification_booting))

        isStartedInProcess = true
        settingsManager.setServiceRunning(true)
        settingsManager.setLastWatchdogHeartbeat(System.currentTimeMillis())
        settingsManager.setLastKnownStatus("service_created")
        registerScreenReceivers()
        cancelRestartAlarm()
        scheduleRescueAlarm("service_created")
        Log.d(serviceLogTag, "Servicio creado")
        Log.i(AppConstants.LOG_TAG, "IdleService creado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_MONITORING
        val source = intent?.getStringExtra(EXTRA_SOURCE) ?: "unspecified"
        Log.d(serviceLogTag, "onStartCommand recibido action=$action source=$source")
        Log.d(serviceLogTag, "Servicio iniciado")
        Log.i(AppConstants.LOG_TAG, "onStartCommand action=$action source=$source startId=$startId")

        if (!settingsManager.isMonitoringEnabled() && action != ACTION_START_MONITORING) {
            Log.i(AppConstants.LOG_TAG, "Servicio ignorado porque el monitoreo esta deshabilitado")
            stopSelf()
            return START_NOT_STICKY
        }

        when (action) {
            ACTION_START_MONITORING -> {
                settingsManager.setMonitoringEnabled(true)
                resetTimerInternal("start:$source", updateTimestamp = true)
            }

            ACTION_RESET_TIMER -> resetTimerInternal("reset:$source", updateTimestamp = true)

            ACTION_SETTINGS_CHANGED -> resetTimerInternal("settings:$source", updateTimestamp = false)

            ACTION_BOOT_COMPLETED -> {
                settingsManager.setMonitoringEnabled(true)
                resetTimerInternal("boot:$source", updateTimestamp = true)
            }

            ACTION_RESTORE_STATE -> restoreTimerFromPersistedState("restore:$source")

            else -> Log.w(AppConstants.LOG_TAG, "Accion de servicio no reconocida: $action")
        }

        settingsManager.setServiceRunning(true)
        startMonitoringLoop()
        ensureWatchdogRunning()
        scheduleBackendSync(currentNetworkDelayMs)
        cancelRestartAlarm()
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(AppConstants.LOG_TAG, "IdleService removido de tareas. Se programa restart.")
        scheduleRestart("task_removed")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        Log.w(AppConstants.LOG_TAG, "IdleService destruido")
        isStartedInProcess = false
        settingsManager.setServiceRunning(false)
        lockRunnableScheduled = false
        monitoringLoopScheduled = false
        backendSyncScheduled = false
        deviceRegisteredInBackend = false
        backendSyncJob?.cancel()
        workerHandler.removeCallbacksAndMessages(null)
        unregisterReceiverSafely(screenEventReceiver)
        cancelRescueAlarm()
        if (settingsManager.isMonitoringEnabled()) {
            scheduleRestart("on_destroy")
        }
        workerThread.quitSafely()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun resetTimerInternal(reason: String, updateTimestamp: Boolean) {
        if (!settingsManager.isMonitoringEnabled()) {
            Log.i(AppConstants.LOG_TAG, "resetTimer ignorado porque monitoreo esta deshabilitado")
            return
        }

        val referenceTimestamp = if (updateTimestamp) {
            settingsManager.markUserInteractionNow()
        } else {
            settingsManager.getLastInteractionTimestamp()
        }

        val timeoutMillis = settingsManager.getIdleTimeoutMillis()
        val remainingMillis = (timeoutMillis - (System.currentTimeMillis() - referenceTimestamp)).coerceAtLeast(0L)

        workerHandler.removeCallbacks(lockRunnable)
        lockRunnableScheduled = false
        Log.i(
            AppConstants.LOG_TAG,
            "resetTimer reason=$reason timeout=${timeoutMillis}ms remaining=${remainingMillis}ms"
        )
        Log.d(serviceLogTag, "Timer reprogramado reason=$reason remaining=${remainingMillis}ms")
        settingsManager.setLastKnownStatus(reason)
        settingsManager.setLastSeenTimestamp(System.currentTimeMillis())
        updateNotification(getString(R.string.notification_active, settingsManager.getIdleTimeoutMinutes()))
        broadcastStatus(isActive = true, lastEvent = reason)
        workerHandler.postDelayed(lockRunnable, remainingMillis)
        lockRunnableScheduled = true
    }

    private fun restoreTimerFromPersistedState(reason: String) {
        if (!settingsManager.isMonitoringEnabled()) {
            Log.i(AppConstants.LOG_TAG, "restoreTimer ignorado porque monitoreo esta deshabilitado")
            return
        }

        val remainingMillis = settingsManager.getRemainingTimeoutMillis()
        Log.i(AppConstants.LOG_TAG, "Restaurando timer reason=$reason remaining=${remainingMillis}ms")
        resetTimerInternal(reason, updateTimestamp = false)
    }

    private fun executeScreenLock(reason: String, modeOverride: IdleMode? = null) {
        lockRunnableScheduled = false
        val idleMode = modeOverride ?: settingsManager.getIdleMode()
        Log.d(serviceLogTag, "Ejecutando apagado por inactividad mode=$idleMode reason=$reason")
        Log.i(AppConstants.LOG_TAG, "Ejecutando modo de inactividad mode=$idleMode reason=$reason")
        val locked = screenController.lockScreen("$reason:${idleMode.name}")
        if (locked) {
            settingsManager.setLastInteractionTimestamp(System.currentTimeMillis())
        }

        val lastEvent = executeIdleMode(idleMode, reason, locked)

        val notificationText = if (locked) {
            getString(R.string.notification_locked)
        } else {
            getString(R.string.notification_lock_failed)
        }

        updateNotification(notificationText)
        settingsManager.setLastKnownStatus(lastEvent)
        settingsManager.setLastSeenTimestamp(System.currentTimeMillis())
        broadcastStatus(
            isActive = settingsManager.isMonitoringEnabled(),
            lastEvent = lastEvent
        )
        if (networkClient.isConfigured()) {
            sendStatusToBackend(lastEvent)
        }
    }

    private fun startMonitoringLoop() {
        if (!settingsManager.isMonitoringEnabled()) {
            monitoringLoopScheduled = false
            workerHandler.removeCallbacks(monitoringLoopRunnable)
            return
        }
        if (monitoringLoopScheduled) {
            return
        }

        monitoringLoopScheduled = true
        workerHandler.postDelayed(monitoringLoopRunnable, AppConstants.MONITORING_LOOP_INTERVAL_MS)
    }

    private fun checkIdleAndAct() {
        val remainingMillis = settingsManager.getRemainingTimeoutMillis()
        Log.d(serviceLogTag, "Loop de monitoreo remaining=${remainingMillis}ms")
        if (remainingMillis > 0L) {
            return
        }

        if (!screenController.isAdminActive()) {
            Log.e(serviceLogTag, "Device Admin no activo")
            broadcastStatus(
                isActive = settingsManager.isMonitoringEnabled(),
                lastEvent = "device_admin_required"
            )
            return
        }

        workerHandler.removeCallbacks(lockRunnable)
        lockRunnableScheduled = false
        executeScreenLock("monitoring_loop")
    }

    private fun executeIdleMode(mode: IdleMode, reason: String, locked: Boolean): String {
        if (!locked) {
            Log.e(
                AppConstants.LOG_TAG,
                "Modo $mode omitido porque lockNow()/goToSleep() no completo el apagado. reason=$reason"
            )
            return "screen_lock_failed"
        }

        return try {
            when (mode) {
                IdleMode.SCREEN_OFF -> {
                    Log.i(AppConstants.LOG_TAG, "Modo SCREEN_OFF ejecutado. locked=$locked")
                    "screen_locked"
                }

                IdleMode.SCREEN_OFF_AND_LOCK -> {
                    val kioskEnsured = ensureKioskMode("mode_lock:$reason", reapplyPolicies = false)
                    Log.i(
                        AppConstants.LOG_TAG,
                        "Modo SCREEN_OFF_AND_LOCK ejecutado. locked=$locked kioskEnsured=$kioskEnsured"
                    )
                    if (kioskEnsured) "screen_locked_and_lock_task" else "screen_lock_or_lock_task_failed"
                }

                IdleMode.SCREEN_OFF_AND_RESTART_APP -> {
                    val restarted = restartLauncher("mode_restart:$reason")
                    Log.i(
                        AppConstants.LOG_TAG,
                        "Modo SCREEN_OFF_AND_RESTART_APP ejecutado. locked=$locked restarted=$restarted"
                    )
                    if (restarted) "screen_locked_and_restart" else "screen_lock_or_restart_failed"
                }

                IdleMode.SCREEN_OFF_AND_KIOSK_ENFORCE -> {
                    val kioskEnsured = ensureKioskMode("mode_enforce:$reason", reapplyPolicies = true)
                    Log.i(
                        AppConstants.LOG_TAG,
                        "Modo SCREEN_OFF_AND_KIOSK_ENFORCE ejecutado. locked=$locked kioskEnsured=$kioskEnsured"
                    )
                    if (kioskEnsured) {
                        "screen_locked_and_kiosk_enforced"
                    } else {
                        "screen_lock_or_kiosk_enforce_failed"
                    }
                }
            }
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error ejecutando modo de inactividad $mode", throwable)
            if (locked) "screen_locked_mode_error" else "screen_lock_failed_mode_error"
        }
    }

    private fun ensureKioskMode(reason: String, reapplyPolicies: Boolean): Boolean {
        if (!isDeviceOwner()) {
            Log.e(AppConstants.LOG_TAG, "ensureKioskMode cancelado: Device Owner no activo. reason=$reason")
            return false
        }

        var success = true
        if (reapplyPolicies) {
            val applied = try {
                screenController.applyDeviceOwnerPolicies(
                    android.content.ComponentName(this, KioskLauncherActivity::class.java)
                )
            } catch (throwable: Throwable) {
                Log.e(AppConstants.LOG_TAG, "Error re-aplicando politicas kiosk. reason=$reason", throwable)
                false
            }
            success = success && applied
        }

        val lockTaskAllowed = try {
            screenController.allowCurrentAppInLockTask()
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error habilitando lock task packages. reason=$reason", throwable)
            false
        }
        success = success && lockTaskAllowed

        val restarted = restartLauncher("ensure_kiosk:$reason")
        success = success && restarted
        Log.i(AppConstants.LOG_TAG, "ensureKioskMode reason=$reason success=$success")
        return success
    }

    private fun restartLauncher(reason: String): Boolean {
        return try {
            val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
                setClass(this@IdleService, KioskLauncherActivity::class.java)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            startActivity(launcherIntent)
            Log.i(AppConstants.LOG_TAG, "Launcher reiniciado. reason=$reason")
            true
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "No fue posible reiniciar launcher. reason=$reason", throwable)
            false
        }
    }

    private fun isDeviceOwner(): Boolean = screenController.isDeviceOwner()

    private fun ensureWatchdogRunning() {
        workerHandler.removeCallbacks(watchdogRunnable)
        workerHandler.postDelayed(watchdogRunnable, AppConstants.WATCHDOG_INTERVAL_MS)
    }

    private fun scheduleBackendSync(delayMillis: Long = currentNetworkDelayMs) {
        if (!settingsManager.isMonitoringEnabled()) {
            backendSyncScheduled = false
            workerHandler.removeCallbacks(backendSyncRunnable)
            return
        }
        if (backendSyncScheduled) {
            return
        }

        backendSyncScheduled = true
        workerHandler.postDelayed(backendSyncRunnable, delayMillis)
    }

    private fun launchBackendSync() {
        if (!settingsManager.isMonitoringEnabled()) {
            return
        }
        if (backendSyncJob?.isActive == true) {
            Log.d(AppConstants.LOG_TAG, "Backend sync omitido: ya existe una operacion en curso")
            return
        }

        backendSyncJob = serviceScope.launch {
            val syncSuccessful = performBackendSync()
            workerHandler.post {
                backendSyncJob = null
                if (!settingsManager.isMonitoringEnabled()) {
                    return@post
                }

                if (syncSuccessful) {
                    if (currentNetworkDelayMs != AppConstants.NETWORK_BACKOFF_INITIAL_MS) {
                        Log.i(AppConstants.LOG_TAG, "Conexion restaurada. Backoff reseteado a 10s")
                    }
                    currentNetworkDelayMs = AppConstants.NETWORK_BACKOFF_INITIAL_MS
                } else {
                    currentNetworkDelayMs = (currentNetworkDelayMs * 2)
                        .coerceAtMost(AppConstants.NETWORK_BACKOFF_MAX_MS)
                    Log.w(
                        AppConstants.LOG_TAG,
                        "Backend sync fallido. Reintentando en ${currentNetworkDelayMs}ms"
                    )
                }
                scheduleBackendSync(currentNetworkDelayMs)
            }
        }
    }

    private fun performBackendSync(): Boolean {
        if (!settingsManager.isMonitoringEnabled()) {
            return true
        }
        if (!networkClient.isConfigured()) {
            Log.d(AppConstants.LOG_TAG, "Backend sync omitido: backend no configurado")
            return true
        }

        val deviceId = settingsManager.getOrCreateDeviceId()
        if (!deviceRegisteredInBackend) {
            val registered = networkClient.registerDevice(deviceId)
            if (!registered) {
                return false
            }
            networkClient.sendLog(deviceId, "device registered")
            deviceRegisteredInBackend = true
        }

        val heartbeatPayload = buildStatusPayload("heartbeat")
        val heartbeatSent = networkClient.sendHeartbeat(deviceId, heartbeatPayload)
        Log.i(AppConstants.LOG_TAG, "Heartbeat enviado=$heartbeatSent deviceId=$deviceId")

        val commandResult: CommandFetchResult = networkClient.fetchCommands(deviceId)
        if (commandResult.commands.isNotEmpty()) {
            Log.i(AppConstants.LOG_TAG, "Comandos recibidos=${commandResult.commands.size}")
        }
        handleRemoteCommands(commandResult.commands)
        return heartbeatSent && commandResult.success
    }

    private fun sendStatusToBackend(lastEvent: String) {
        if (!networkClient.isConfigured()) {
            return
        }
        serviceScope.launch {
            val deviceId = settingsManager.getOrCreateDeviceId()
            val statusSent = networkClient.sendStatus(deviceId, buildStatusPayload(lastEvent))
            Log.i(AppConstants.LOG_TAG, "Status enviado=$statusSent event=$lastEvent")
        }
    }

    private fun buildStatusPayload(lastEvent: String): JSONObject {
        val status = JSONObject()
        val now = System.currentTimeMillis()
        settingsManager.setLastSeenTimestamp(now)
        status.put("device_id", settingsManager.getOrCreateDeviceId())
        status.put("status", settingsManager.getLastKnownStatus())
        status.put("last_seen", now)
        status.put("last_event", lastEvent)
        status.put("mode", settingsManager.getIdleMode().name)
        status.put("timeout_minutes", settingsManager.getIdleTimeoutMinutes())
        status.put("monitoring_enabled", settingsManager.isMonitoringEnabled())
        status.put("service_running", settingsManager.isServiceRunning())
        status.put("device_owner", isDeviceOwner())
        status.put("lock_task_permitted", screenController.isLockTaskPermitted())
        status.put("lock_task_active", isInLockTaskMode())
        return status
    }

    private fun handleRemoteCommands(commands: List<RemoteCommand>) {
        commands.forEach { command ->
            if (command.action.isBlank()) {
                return@forEach
            }

            val commandId = command.id
            if (!commandId.isNullOrBlank() && commandId == settingsManager.getLastCommandId()) {
                Log.d(AppConstants.LOG_TAG, "Comando remoto duplicado omitido id=$commandId")
                return@forEach
            }

            Log.i(AppConstants.LOG_TAG, "Comando recibido id=${command.id ?: "sin_id"} action=${command.action}")
            val executed = executeRemoteCommand(command)
            if (executed && !commandId.isNullOrBlank()) {
                val markedExecuted = networkClient.markCommandExecuted(commandId)
                if (markedExecuted) {
                    settingsManager.setLastCommandId(commandId)
                    networkClient.sendLog(
                        settingsManager.getOrCreateDeviceId(),
                        "command executed",
                        JSONObject().apply {
                            put("command_id", commandId)
                            put("action", command.action)
                        }
                    )
                }
            }
        }
    }

    private fun executeRemoteCommand(command: RemoteCommand): Boolean {
        Log.i(AppConstants.LOG_TAG, "Ejecutando accion action=${command.action}")
        return try {
            when (command.action.uppercase()) {
                "SCREEN_OFF" -> {
                    executeScreenLock(
                        reason = "remote_command_screen_off",
                        modeOverride = IdleMode.SCREEN_OFF
                    )
                    true
                }

                "RESTART_APP" -> restartLauncher("remote_command_restart_app")

                "PING" -> {
                    sendStatusToBackend("remote_command_ping")
                    true
                }

                "UPDATE_CONFIG" -> applyRemoteConfig(command)

                else -> {
                    Log.w(AppConstants.LOG_TAG, "Comando remoto no soportado: ${command.action}")
                    false
                }
            }
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error ejecutando comando remoto ${command.action}", throwable)
            false
        }
    }

    private fun applyRemoteConfig(command: RemoteCommand): Boolean {
        command.timeoutMinutes?.let { minutes ->
            if (minutes in AppConstants.AVAILABLE_TIMEOUTS_MINUTES) {
                settingsManager.setIdleTimeoutMinutes(minutes)
            } else {
                Log.w(AppConstants.LOG_TAG, "timeout_minutes remoto ignorado por valor invalido: $minutes")
            }
        }
        command.idleMode?.let { mode ->
            settingsManager.setIdleMode(mode)
        }
        val monitoringEnabled = command.monitoringEnabled
        monitoringEnabled?.let(settingsManager::setMonitoringEnabled)

        settingsManager.setLastKnownStatus("remote_config_updated")
        if (settingsManager.isMonitoringEnabled()) {
            resetTimerInternal("remote_update_config", updateTimestamp = false)
        }
        Log.i(
            AppConstants.LOG_TAG,
            "Configuracion remota aplicada timeout=${command.timeoutMinutes} mode=${command.idleMode} monitoring=${command.monitoringEnabled}"
        )
        sendStatusToBackend("remote_update_config")
        if (monitoringEnabled == false) {
            stopSelf()
        }
        return true
    }

    private fun isInLockTaskMode(): Boolean {
        val activityManager = getSystemService(ActivityManager::class.java) ?: return false
        return activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    private fun buildNotification(contentText: String): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            100,
            Intent(this, KioskLauncherActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, AppConstants.NOTIFICATION_CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        return builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(contentText)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun promoteToForeground(contentText: String) {
        val notification = buildNotification(contentText)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    AppConstants.NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                )
            } else {
                startForeground(AppConstants.NOTIFICATION_ID, notification)
            }
            Log.d(serviceLogTag, "Foreground service promovido correctamente")
        } catch (foregroundBlocked: ForegroundServiceStartNotAllowedException) {
            Log.e("Service", "Foreground start blocked", foregroundBlocked)
        } catch (securityException: SecurityException) {
            Log.e(AppConstants.LOG_TAG, "Error iniciando foreground con tipos avanzados", securityException)
            startForeground(AppConstants.NOTIFICATION_ID, notification)
            Log.d(serviceLogTag, "Foreground service promovido con fallback sin tipos avanzados")
        }
    }

    private fun updateNotification(contentText: String) {
        getSystemService(NotificationManager::class.java)
            ?.notify(AppConstants.NOTIFICATION_ID, buildNotification(contentText))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            AppConstants.NOTIFICATION_CHANNEL_ID,
            AppConstants.NOTIFICATION_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_description)
        }
        manager.createNotificationChannel(channel)
    }

    private fun broadcastStatus(isActive: Boolean, lastEvent: String) {
        settingsManager.setLastKnownStatus(lastEvent)
        settingsManager.setLastSeenTimestamp(System.currentTimeMillis())
        sendBroadcast(
            Intent(ACTION_STATUS_CHANGED).apply {
                setPackage(packageName)
                putExtra(EXTRA_IS_ACTIVE, isActive)
                putExtra(EXTRA_LAST_EVENT, lastEvent)
            }
        )
    }

    private fun registerScreenReceivers() {
        if (screenReceiverRegistered) {
            return
        }
        try {
            registerReceiver(screenEventReceiver, IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_USER_PRESENT)
            })
            screenReceiverRegistered = true
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "No fue posible registrar screenEventReceiver", throwable)
        }
    }

    private fun unregisterReceiverSafely(receiver: BroadcastReceiver) {
        if (!screenReceiverRegistered) {
            return
        }
        try {
            unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
            // Receiver no registrado o ya liberado.
        } finally {
            screenReceiverRegistered = false
        }
    }

    private fun scheduleRestart(reason: String) {
        if (!settingsManager.isMonitoringEnabled()) {
            return
        }

        val alarmManager = getSystemService(AlarmManager::class.java) ?: return
        val triggerAtMillis = System.currentTimeMillis() + AppConstants.SERVICE_RESTART_DELAY_MS
        val restartIntent = Intent(this, ServiceWatchdogReceiver::class.java).apply {
            action = ACTION_WATCHDOG_RESTART
            putExtra(EXTRA_SOURCE, reason)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            AppConstants.SERVICE_RESTART_REQUEST_CODE,
            restartIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        Log.w(AppConstants.LOG_TAG, "Programando reinicio del servicio. reason=$reason")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                pendingIntent
            )
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
        }
    }

    private fun cancelRestartAlarm() {
        val alarmManager = getSystemService(AlarmManager::class.java) ?: return
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            AppConstants.SERVICE_RESTART_REQUEST_CODE,
            Intent(this, ServiceWatchdogReceiver::class.java).apply {
                action = ACTION_WATCHDOG_RESTART
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
    }

    private fun scheduleRescueAlarm(reason: String) {
        if (!settingsManager.isMonitoringEnabled()) {
            return
        }

        val alarmManager = getSystemService(AlarmManager::class.java) ?: return
        val triggerAtMillis = System.currentTimeMillis() + (AppConstants.WATCHDOG_INTERVAL_MS * 2)
        val rescueIntent = Intent(this, ServiceWatchdogReceiver::class.java).apply {
            action = ACTION_WATCHDOG_RESTART
            putExtra(EXTRA_SOURCE, "rescue:$reason")
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            AppConstants.SERVICE_WATCHDOG_REQUEST_CODE,
            rescueIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                pendingIntent
            )
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
        }
    }

    private fun cancelRescueAlarm() {
        val alarmManager = getSystemService(AlarmManager::class.java) ?: return
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            AppConstants.SERVICE_WATCHDOG_REQUEST_CODE,
            Intent(this, ServiceWatchdogReceiver::class.java).apply {
                action = ACTION_WATCHDOG_RESTART
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
    }

    companion object {
        @Volatile
        private var isStartedInProcess = false

        const val ACTION_START_MONITORING = "com.embedded.idlescreenguardian.action.START_MONITORING"
        const val ACTION_RESET_TIMER = "com.embedded.idlescreenguardian.action.RESET_TIMER"
        const val ACTION_SETTINGS_CHANGED =
            "com.embedded.idlescreenguardian.action.SETTINGS_CHANGED"
        const val ACTION_BOOT_COMPLETED = "com.embedded.idlescreenguardian.action.BOOT_COMPLETED"
        const val ACTION_RESTORE_STATE = "com.embedded.idlescreenguardian.action.RESTORE_STATE"
        const val ACTION_STATUS_CHANGED = "com.embedded.idlescreenguardian.action.STATUS_CHANGED"
        const val ACTION_WATCHDOG_RESTART = "com.embedded.idlescreenguardian.action.WATCHDOG_RESTART"

        const val EXTRA_IS_ACTIVE = "extra_is_active"
        const val EXTRA_LAST_EVENT = "extra_last_event"
        const val EXTRA_SOURCE_PUBLIC = "extra_source"
        private const val EXTRA_SOURCE = EXTRA_SOURCE_PUBLIC

        fun startMonitoring(context: Context, source: String = "manual_start") {
            dispatchServiceIntent(context, ACTION_START_MONITORING, source)
        }

        fun handleBootEvent(context: Context, source: String = "boot") {
            dispatchServiceIntent(context, ACTION_BOOT_COMPLETED, source)
        }

        fun resetTimer(context: Context, source: String = "interaction") {
            Log.d(AppConstants.LOG_TAG, "resetTimer solicitado desde $source")
            dispatchServiceIntent(context, ACTION_RESET_TIMER, source)
        }

        fun notifySettingsChanged(context: Context, source: String = "settings_ui") {
            dispatchServiceIntent(context, ACTION_SETTINGS_CHANGED, source)
        }

        fun restoreState(context: Context, source: String = "restore_request") {
            dispatchServiceIntent(context, ACTION_RESTORE_STATE, source)
        }

        fun stopMonitoring(context: Context) {
            val settingsManager = SettingsManager(context)
            settingsManager.setMonitoringEnabled(false)
            settingsManager.setServiceRunning(false)
            context.stopService(Intent(context, IdleService::class.java))
        }

        private fun dispatchServiceIntent(context: Context, action: String, source: String) {
            val settingsManager = SettingsManager(context)
            val serviceIntent = buildServiceIntent(context, action, source)

            val shouldUseForegroundStart = when (action) {
                ACTION_START_MONITORING,
                ACTION_BOOT_COMPLETED -> true

                ACTION_RESTORE_STATE -> {
                    source.contains("watchdog") ||
                        source.contains("boot") ||
                        !settingsManager.isServiceRunning() ||
                        !isStartedInProcess
                }

                else -> !settingsManager.isServiceRunning() && !isStartedInProcess
            }

            try {
                if (shouldUseForegroundStart && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d("IdleService", "Solicitud de arranque enviada action=$action source=$source")
            } catch (foregroundBlocked: ForegroundServiceStartNotAllowedException) {
                Log.e("Service", "Foreground start blocked", foregroundBlocked)
            } catch (illegalStateException: IllegalStateException) {
                if (
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    illegalStateException.javaClass.name == "android.app.ForegroundServiceStartNotAllowedException"
                ) {
                    Log.e(
                        AppConstants.LOG_TAG,
                        "ForegroundServiceStartNotAllowedException action=$action source=$source",
                        illegalStateException
                    )
                    try {
                        context.startService(serviceIntent)
                    } catch (fallbackThrowable: Throwable) {
                        Log.e(
                            AppConstants.LOG_TAG,
                            "Fallback startService tambien fallo para action=$action",
                            fallbackThrowable
                        )
                    }
                    return
                }
                Log.w(
                    AppConstants.LOG_TAG,
                    "startService bloqueado para action=$action. Fallback a startForegroundService",
                    illegalStateException
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }

        private fun buildServiceIntent(context: Context, action: String, source: String): Intent {
            return Intent(context, IdleService::class.java).apply {
                this.action = action
                putExtra(EXTRA_SOURCE, source)
            }
        }
    }
}
