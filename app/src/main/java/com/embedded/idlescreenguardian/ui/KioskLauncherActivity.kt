package com.embedded.idlescreenguardian.ui

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.ForegroundServiceStartNotAllowedException
import android.app.admin.DevicePolicyManager
import android.content.pm.PackageManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import com.embedded.idlescreenguardian.R
import com.embedded.idlescreenguardian.admin.KioskDeviceAdminReceiver
import com.embedded.idlescreenguardian.common.AppConstants
import com.embedded.idlescreenguardian.common.IdleMode
import com.embedded.idlescreenguardian.service.IdleService
import com.embedded.idlescreenguardian.utils.ScreenController
import com.embedded.idlescreenguardian.utils.SettingsManager

class KioskLauncherActivity : Activity() {

    private val uiLogTag = "UI"

    private data class KioskState(
        val isDeviceOwner: Boolean,
        val isLockTaskPermitted: Boolean,
        val isLockTaskActive: Boolean,
        val isServiceActive: Boolean
    )

    private lateinit var settingsManager: SettingsManager
    private lateinit var screenController: ScreenController

    private lateinit var timeoutSpinner: Spinner
    private lateinit var modeSpinner: Spinner
    private lateinit var selectedTimeoutValue: TextView
    private lateinit var selectedModeValue: TextView
    private lateinit var currentStateValue: TextView
    private lateinit var adminStateValue: TextView
    private lateinit var kioskStateValue: TextView
    private lateinit var batteryStateValue: TextView
    private lateinit var activeModeValue: TextView
    private lateinit var lastEventValue: TextView
    private lateinit var statusMessage: TextView
    private lateinit var toggleButton: Button
    private lateinit var requestAdminButton: Button
    private lateinit var requestBatteryOptimizationButton: Button

    private var serviceActive = false
    private var statusReceiverRegistered = false
    private var lastServiceEvent: String = "idle"
    private var pendingEnableAfterAdmin = false

    private val serviceStatusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != IdleService.ACTION_STATUS_CHANGED) {
                return
            }
            serviceActive = intent.getBooleanExtra(IdleService.EXTRA_IS_ACTIVE, false)
            lastServiceEvent = intent.getStringExtra(IdleService.EXTRA_LAST_EVENT) ?: "idle"
            updateStatusUI()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk_launcher)
        title = getString(R.string.app_name)

        settingsManager = SettingsManager(applicationContext)
        screenController = ScreenController(applicationContext)
        serviceActive = settingsManager.isServiceRunning()

        bindViews()
        setupTimeoutSpinner()
        setupModeSpinner()
        setupListeners()
        requestNotificationPermissionIfNeeded()
        configureKioskModeIfPossible()

        if (settingsManager.isMonitoringEnabled()) {
            IdleService.restoreState(applicationContext, "launcher_create")
        }
        updateStatusUI()
    }

    override fun onStart() {
        super.onStart()
        registerStatusReceiver()
    }

    override fun onResume() {
        super.onResume()
        applyImmersiveMode()
        configureKioskModeIfPossible()
        ensureLockTaskMode("activity_resume")
        if (settingsManager.isMonitoringEnabled()) {
            IdleService.restoreState(applicationContext, "launcher_resume")
        }
        updateStatusUI()
    }

    override fun onStop() {
        unregisterStatusReceiver()
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyImmersiveMode()
        }
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (settingsManager.isMonitoringEnabled()) {
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN,
                MotionEvent.ACTION_POINTER_DOWN -> IdleService.resetTimer(
                    applicationContext,
                    "launcher_touch"
                )
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val kioskState = checkKioskState()
            if (
                kioskState.isLockTaskActive &&
                (
                    event.keyCode == KeyEvent.KEYCODE_APP_SWITCH ||
                        event.keyCode == KeyEvent.KEYCODE_MENU ||
                        event.keyCode == KeyEvent.KEYCODE_SEARCH ||
                        event.keyCode == KeyEvent.KEYCODE_ASSIST
                    )
            ) {
                Log.i(AppConstants.LOG_TAG, "Tecla bloqueada en modo kiosk: ${event.keyCode}")
                return true
            }
        }
        if (settingsManager.isMonitoringEnabled() && event.action == KeyEvent.ACTION_DOWN) {
            IdleService.resetTimer(applicationContext, "launcher_key")
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        if (settingsManager.isMonitoringEnabled()) {
            IdleService.resetTimer(applicationContext, "launcher_user_interaction")
        }
    }

    @Deprecated("Kiosk mode back suppression")
    override fun onBackPressed() {
        Log.i(AppConstants.LOG_TAG, "Back bloqueado en launcher kiosk")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQUEST_DEVICE_ADMIN -> {
                updateStatusUI()
                if (screenController.isDeviceOwner()) {
                    configureKioskModeIfPossible()
                } else if (screenController.isAdminActive()) {
                    Log.w(
                        AppConstants.LOG_TAG,
                        "Device Admin activo sin Device Owner. Kiosk real sigue bloqueado"
                    )
                }
                if (pendingEnableAfterAdmin && !settingsManager.isMonitoringEnabled()) {
                    startMonitoring()
                }
                pendingEnableAfterAdmin = false
            }

            REQUEST_BATTERY_OPTIMIZATION -> updateStatusUI()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == AppConstants.NOTIFICATION_PERMISSION_REQUEST_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            Log.i(AppConstants.LOG_TAG, "POST_NOTIFICATIONS granted=$granted")
            updateStatusUI()
        }
    }

    private fun bindViews() {
        timeoutSpinner = findViewById(R.id.timeoutSpinner)
        modeSpinner = findViewById(R.id.modeSpinner)
        selectedTimeoutValue = findViewById(R.id.selectedTimeoutValue)
        selectedModeValue = findViewById(R.id.selectedModeValue)
        currentStateValue = findViewById(R.id.currentStateValue)
        adminStateValue = findViewById(R.id.adminStateValue)
        kioskStateValue = findViewById(R.id.kioskStateValue)
        batteryStateValue = findViewById(R.id.batteryStateValue)
        activeModeValue = findViewById(R.id.activeModeValue)
        lastEventValue = findViewById(R.id.lastEventValue)
        statusMessage = findViewById(R.id.statusMessage)
        toggleButton = findViewById(R.id.toggleButton)
        requestAdminButton = findViewById(R.id.requestAdminButton)
        requestBatteryOptimizationButton = findViewById(R.id.requestBatteryOptimizationButton)
    }

    private fun setupTimeoutSpinner() {
        val labels = AppConstants.AVAILABLE_TIMEOUTS_MINUTES.map {
            getString(R.string.timeout_format, it)
        }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, labels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        timeoutSpinner.adapter = adapter
        val currentIndex = AppConstants.AVAILABLE_TIMEOUTS_MINUTES.indexOf(settingsManager.getIdleTimeoutMinutes())
            .coerceAtLeast(0)
        timeoutSpinner.setSelection(currentIndex, false)
        selectedTimeoutValue.text =
            getString(R.string.timeout_format, settingsManager.getIdleTimeoutMinutes())
    }

    private fun setupModeSpinner() {
        val labels = IdleMode.values().map { getModeLabel(it) }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, labels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        modeSpinner.adapter = adapter
        val currentMode = settingsManager.getIdleMode()
        val currentIndex = IdleMode.values().indexOf(currentMode).coerceAtLeast(0)
        modeSpinner.setSelection(currentIndex, false)
        selectedModeValue.text = getModeLabel(currentMode)
        activeModeValue.text = getModeLabel(currentMode)
    }

    private fun setupListeners() {
        timeoutSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val selectedMinutes = AppConstants.AVAILABLE_TIMEOUTS_MINUTES[position]
                settingsManager.setIdleTimeoutMinutes(selectedMinutes)
                selectedTimeoutValue.text = getString(R.string.timeout_format, selectedMinutes)
                if (settingsManager.isMonitoringEnabled()) {
                    IdleService.notifySettingsChanged(applicationContext, "launcher_spinner")
                }
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        modeSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val selectedMode = IdleMode.values()[position]
                settingsManager.setIdleMode(selectedMode)
                selectedModeValue.text = getModeLabel(selectedMode)
                activeModeValue.text = getModeLabel(selectedMode)
                if (settingsManager.isMonitoringEnabled()) {
                    IdleService.notifySettingsChanged(applicationContext, "launcher_mode")
                }
                updateStatusUI()
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        toggleButton.setOnClickListener {
            Log.d(uiLogTag, "Activar monitoreo presionado")
            if (settingsManager.isMonitoringEnabled()) {
                disableMonitoring()
            } else {
                startMonitoring()
            }
        }

        requestBatteryOptimizationButton.setOnClickListener {
            requestIgnoreBatteryOptimizations()
        }

        requestAdminButton.setOnClickListener {
            pendingEnableAfterAdmin = false
            requestDeviceAdmin()
        }
    }

    private fun startMonitoring() {
        Log.d(uiLogTag, "Inicio de monitoreo solicitado")
        requestNotificationPermissionIfNeeded()
        settingsManager.setMonitoringEnabled(true)
        settingsManager.markUserInteractionNow()
        settingsManager.setServiceRunning(true)
        serviceActive = true
        if (!screenController.isAdminActive()) {
            Log.w(uiLogTag, "Device Admin no activo. El servicio iniciara, pero lockNow() no podra ejecutarse")
            statusMessage.text = getString(R.string.status_admin_required_running)
        }

        val started = requestMonitoringServiceStart()
        if (!started) {
            serviceActive = false
            settingsManager.setMonitoringEnabled(false)
            settingsManager.setServiceRunning(false)
            updateStatusUI()
            return
        }
        if (screenController.isDeviceOwner()) {
            configureKioskModeIfPossible()
            ensureLockTaskMode("enable_monitoring")
        }
        if (!isIgnoringBatteryOptimizations()) {
            requestIgnoreBatteryOptimizations()
        }
        updateStatusUI()
    }

    private fun disableMonitoring() {
        IdleService.stopMonitoring(applicationContext)
        serviceActive = false
        updateStatusUI()
    }

    private fun requestDeviceAdmin() {
        val componentName = ComponentName(this, KioskDeviceAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName)
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                getString(R.string.device_admin_explanation)
            )
        }
        startActivityForResult(intent, REQUEST_DEVICE_ADMIN)
    }

    private fun configureKioskModeIfPossible() {
        val kioskState = checkKioskState()
        if (!kioskState.isDeviceOwner) {
            Log.w(AppConstants.LOG_TAG, "Kiosk critico bloqueado: la app no es Device Owner")
            return
        }

        try {
            screenController.applyDeviceOwnerPolicies(
                ComponentName(this, KioskLauncherActivity::class.java)
            )
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Fallo aplicando politicas kiosk", throwable)
        }

        try {
            screenController.allowCurrentAppInLockTask()
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Fallo configurando lock task packages", throwable)
        }
    }

    private fun ensureLockTaskMode(reason: String) {
        val kioskState = checkKioskState()
        if (!kioskState.isDeviceOwner) {
            Log.w(AppConstants.LOG_TAG, "Lock task omitido: Device Owner no activo. reason=$reason")
            return
        }
        if (!kioskState.isLockTaskPermitted) {
            Log.w(AppConstants.LOG_TAG, "Lock task no permitido para el paquete. reason=$reason")
            return
        }
        if (kioskState.isLockTaskActive) {
            return
        }

        try {
            Log.i(AppConstants.LOG_TAG, "Entrando en lock task mode. reason=$reason")
            startLockTask()
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "No fue posible iniciar lock task. reason=$reason", throwable)
        }
    }

    private fun checkKioskState(): KioskState {
        val isDeviceOwner = try {
            screenController.isDeviceOwner()
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error verificando Device Owner", throwable)
            false
        }

        val isLockTaskPermitted = if (isDeviceOwner) {
            try {
                screenController.isLockTaskPermitted()
            } catch (throwable: Throwable) {
                Log.e(AppConstants.LOG_TAG, "Error verificando permiso de lock task", throwable)
                false
            }
        } else {
            false
        }

        val isLockTaskActive = try {
            isInLockTaskMode()
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error verificando estado actual de lock task", throwable)
            false
        }

        val isServiceActive = try {
            settingsManager.isServiceRunning() || serviceActive
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error verificando estado del servicio", throwable)
            false
        }

        return KioskState(
            isDeviceOwner = isDeviceOwner,
            isLockTaskPermitted = isLockTaskPermitted,
            isLockTaskActive = isLockTaskActive,
            isServiceActive = isServiceActive
        )
    }

    private fun isInLockTaskMode(): Boolean {
        val activityManager = getSystemService(ActivityManager::class.java) ?: return false
        return activityManager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    private fun requestIgnoreBatteryOptimizations() {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivityForResult(intent, REQUEST_BATTERY_OPTIMIZATION)
        } catch (throwable: Throwable) {
            Log.w(AppConstants.LOG_TAG, "No fue posible abrir exclusion de bateria del OEM", throwable)
            openBatteryOptimizationSettings()
        }
    }

    private fun openBatteryOptimizationSettings() {
        try {
            startActivityForResult(
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
                REQUEST_BATTERY_OPTIMIZATION
            )
        } catch (throwable: Throwable) {
            Log.w(AppConstants.LOG_TAG, "No fue posible abrir ajustes generales de bateria", throwable)
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return
        }
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return
        }
        try {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                AppConstants.NOTIFICATION_PERMISSION_REQUEST_CODE
            )
        } catch (throwable: Throwable) {
            Log.w(AppConstants.LOG_TAG, "No fue posible solicitar POST_NOTIFICATIONS", throwable)
        }
    }

    private fun requestMonitoringServiceStart(): Boolean {
        val serviceIntent = Intent(this, IdleService::class.java).apply {
            action = IdleService.ACTION_START_MONITORING
            putExtra(IdleService.EXTRA_SOURCE_PUBLIC, "launcher_enable")
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Log.d(uiLogTag, "Iniciando IdleService con startForegroundService()")
                startForegroundService(serviceIntent)
            } else {
                Log.d(uiLogTag, "Iniciando IdleService con startService()")
                startService(serviceIntent)
            }
            Log.d(uiLogTag, "Servicio solicitado correctamente")
            true
        } catch (exception: ForegroundServiceStartNotAllowedException) {
            Log.e("Service", "Foreground start blocked", exception)
            false
        } catch (throwable: Throwable) {
            Log.e(uiLogTag, "Error iniciando servicio", throwable)
            false
        }
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        val powerManager = getSystemService(PowerManager::class.java) ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isIgnoringBatteryOptimizations(packageName)
        } else {
            true
        }
    }

    private fun updateStatusUI() {
        val kioskState = checkKioskState()
        val adminActive = screenController.isAdminActive()
        val timeout = settingsManager.getIdleTimeoutMinutes()
        val idleMode = settingsManager.getIdleMode()
        selectedTimeoutValue.text = getString(R.string.timeout_format, timeout)
        selectedModeValue.text = getModeLabel(idleMode)
        activeModeValue.text = getModeLabel(idleMode)
        currentStateValue.text = if (kioskState.isServiceActive) {
            getString(R.string.service_state_active)
        } else {
            getString(R.string.service_state_inactive)
        }
        adminStateValue.text = if (adminActive) {
            getString(R.string.device_owner_state_active)
        } else {
            getString(R.string.device_owner_state_inactive)
        }
        kioskStateValue.text = if (kioskState.isLockTaskActive) {
            getString(R.string.lock_task_state_active)
        } else {
            getString(R.string.lock_task_state_inactive)
        }
        batteryStateValue.text = if (isIgnoringBatteryOptimizations()) {
            getString(R.string.battery_ignored)
        } else {
            getString(R.string.battery_not_ignored)
        }
        lastEventValue.text = lastServiceEvent
        toggleButton.text = if (settingsManager.isMonitoringEnabled()) {
            getString(R.string.button_disable)
        } else {
            getString(R.string.button_enable)
        }
        toggleButton.isEnabled = true
        requestAdminButton.isEnabled = !adminActive
        statusMessage.text = when {
            settingsManager.isMonitoringEnabled() && !adminActive ->
                getString(R.string.status_admin_required_running)
            requiresDeviceOwner(idleMode) && !kioskState.isDeviceOwner ->
                getString(R.string.status_mode_requires_device_owner)
            screenController.isDeviceOwner() && !kioskState.isLockTaskPermitted ->
                getString(R.string.status_lock_task_not_permitted)
            settingsManager.isMonitoringEnabled() && !isIgnoringBatteryOptimizations() ->
                getString(R.string.status_battery_not_ignored)
            settingsManager.isMonitoringEnabled() && kioskState.isServiceActive ->
                getString(R.string.status_monitoring_enabled, timeout)
            !adminActive -> getString(R.string.status_admin_required)
            settingsManager.isMonitoringEnabled() ->
                getString(R.string.status_service_recovery)
            else -> getString(R.string.status_monitoring_disabled)
        }
    }

    private fun refreshUi() = updateStatusUI()

    private fun registerStatusReceiver() {
        if (statusReceiverRegistered) {
            return
        }
        try {
            registerReceiver(serviceStatusReceiver, IntentFilter(IdleService.ACTION_STATUS_CHANGED))
            statusReceiverRegistered = true
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "No fue posible registrar receiver de estado", throwable)
        }
    }

    private fun unregisterStatusReceiver() {
        if (!statusReceiverRegistered) {
            return
        }
        try {
            unregisterReceiver(serviceStatusReceiver)
        } catch (_: IllegalArgumentException) {
            // Receiver no registrado o ya liberado.
        } finally {
            statusReceiverRegistered = false
        }
    }

    private fun applyImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.hide(
                WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()
            )
            window.insetsController?.systemBarsBehavior =
                android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    private fun getModeLabel(mode: IdleMode): String {
        return when (mode) {
            IdleMode.SCREEN_OFF -> getString(R.string.mode_screen_off)
            IdleMode.SCREEN_OFF_AND_LOCK -> getString(R.string.mode_screen_off_and_lock)
            IdleMode.SCREEN_OFF_AND_RESTART_APP -> getString(R.string.mode_screen_off_and_restart_app)
            IdleMode.SCREEN_OFF_AND_KIOSK_ENFORCE -> getString(R.string.mode_screen_off_and_kiosk_enforce)
        }
    }

    private fun requiresDeviceOwner(mode: IdleMode): Boolean {
        return mode != IdleMode.SCREEN_OFF
    }

    companion object {
        private const val REQUEST_DEVICE_ADMIN = 2001
        private const val REQUEST_BATTERY_OPTIMIZATION = 2002
    }
}
