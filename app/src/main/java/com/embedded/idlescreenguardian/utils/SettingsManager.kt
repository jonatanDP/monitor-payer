package com.embedded.idlescreenguardian.utils

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import java.util.UUID
import com.embedded.idlescreenguardian.common.AppConstants
import com.embedded.idlescreenguardian.common.IdleMode

class SettingsManager(context: Context) {

    private val appContext = context.applicationContext
    private val storageContext: Context = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        appContext.createDeviceProtectedStorageContext().also {
            it.moveSharedPreferencesFrom(appContext, AppConstants.PREFS_NAME)
        }
    } else {
        appContext
    }

    private val preferences: SharedPreferences =
        storageContext.getSharedPreferences(AppConstants.PREFS_NAME, Context.MODE_PRIVATE)

    fun getIdleTimeoutMinutes(): Int {
        val storedValue = preferences.getInt(KEY_IDLE_TIMEOUT_MINUTES, AppConstants.DEFAULT_TIMEOUT_MINUTES)
        return if (storedValue in AppConstants.AVAILABLE_TIMEOUTS_MINUTES) {
            storedValue
        } else {
            AppConstants.DEFAULT_TIMEOUT_MINUTES
        }
    }

    fun getIdleTimeoutMillis(): Long = getIdleTimeoutMinutes() * 60_000L

    fun setIdleTimeoutMinutes(minutes: Int) {
        preferences.edit().putInt(KEY_IDLE_TIMEOUT_MINUTES, minutes).apply()
    }

    fun getIdleMode(): IdleMode {
        val storedValue = preferences.getString(KEY_IDLE_MODE, IdleMode.SCREEN_OFF.name)
        return try {
            IdleMode.valueOf(storedValue ?: IdleMode.SCREEN_OFF.name)
        } catch (_: IllegalArgumentException) {
            IdleMode.SCREEN_OFF
        }
    }

    fun setIdleMode(mode: IdleMode) {
        preferences.edit().putString(KEY_IDLE_MODE, mode.name).apply()
    }

    fun isMonitoringEnabled(): Boolean = preferences.getBoolean(KEY_MONITORING_ENABLED, false)

    fun setMonitoringEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply()
    }

    fun getLastInteractionTimestamp(): Long {
        val defaultValue = System.currentTimeMillis()
        return preferences.getLong(KEY_LAST_INTERACTION_TIMESTAMP, defaultValue)
    }

    fun setLastInteractionTimestamp(timestamp: Long) {
        preferences.edit().putLong(KEY_LAST_INTERACTION_TIMESTAMP, timestamp).apply()
    }

    fun markUserInteractionNow(): Long {
        val now = System.currentTimeMillis()
        setLastInteractionTimestamp(now)
        return now
    }

    fun getRemainingTimeoutMillis(now: Long = System.currentTimeMillis()): Long {
        val elapsed = (now - getLastInteractionTimestamp()).coerceAtLeast(0L)
        return (getIdleTimeoutMillis() - elapsed).coerceAtLeast(0L)
    }

    fun isServiceRunning(): Boolean = preferences.getBoolean(KEY_SERVICE_RUNNING, false)

    fun setServiceRunning(running: Boolean) {
        preferences.edit().putBoolean(KEY_SERVICE_RUNNING, running).apply()
    }

    fun getLastWatchdogHeartbeat(): Long = preferences.getLong(KEY_LAST_WATCHDOG_HEARTBEAT, 0L)

    fun setLastWatchdogHeartbeat(timestamp: Long) {
        preferences.edit().putLong(KEY_LAST_WATCHDOG_HEARTBEAT, timestamp).apply()
    }

    fun getOrCreateDeviceId(): String {
        val storedValue = preferences.getString(KEY_DEVICE_ID, null)
        if (!storedValue.isNullOrBlank()) {
            return storedValue
        }

        val generatedId = UUID.randomUUID().toString()
        preferences.edit().putString(KEY_DEVICE_ID, generatedId).apply()
        return generatedId
    }

    fun getBackendBaseUrl(): String =
        preferences.getString(KEY_BACKEND_BASE_URL, AppConstants.DEFAULT_BACKEND_BASE_URL)
            ?.trim()
            .orEmpty()

    fun setBackendBaseUrl(baseUrl: String) {
        preferences.edit().putString(KEY_BACKEND_BASE_URL, baseUrl.trim()).apply()
    }

    fun getApiToken(): String =
        preferences.getString(KEY_API_TOKEN, AppConstants.DEFAULT_API_TOKEN)
            ?.trim()
            .orEmpty()

    fun setApiToken(token: String) {
        preferences.edit().putString(KEY_API_TOKEN, token.trim()).apply()
    }

    fun getLastKnownStatus(): String =
        preferences.getString(KEY_LAST_KNOWN_STATUS, AppConstants.DEFAULT_LAST_STATUS)
            ?: AppConstants.DEFAULT_LAST_STATUS

    fun setLastKnownStatus(status: String) {
        preferences.edit().putString(KEY_LAST_KNOWN_STATUS, status).apply()
    }

    fun getLastSeenTimestamp(): Long = preferences.getLong(KEY_LAST_SEEN_TIMESTAMP, 0L)

    fun setLastSeenTimestamp(timestamp: Long) {
        preferences.edit().putLong(KEY_LAST_SEEN_TIMESTAMP, timestamp).apply()
    }

    fun getLastCommandId(): String = preferences.getString(KEY_LAST_COMMAND_ID, "").orEmpty()

    fun setLastCommandId(commandId: String) {
        preferences.edit().putString(KEY_LAST_COMMAND_ID, commandId).apply()
    }

    companion object {
        private const val KEY_IDLE_TIMEOUT_MINUTES = "idle_timeout_minutes"
        private const val KEY_IDLE_MODE = "idle_mode"
        private const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        private const val KEY_LAST_INTERACTION_TIMESTAMP = "last_interaction_timestamp"
        private const val KEY_SERVICE_RUNNING = "service_running"
        private const val KEY_LAST_WATCHDOG_HEARTBEAT = "last_watchdog_heartbeat"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_BACKEND_BASE_URL = "backend_base_url"
        private const val KEY_API_TOKEN = "api_token"
        private const val KEY_LAST_KNOWN_STATUS = "last_known_status"
        private const val KEY_LAST_SEEN_TIMESTAMP = "last_seen_timestamp"
        private const val KEY_LAST_COMMAND_ID = "last_command_id"
    }
}
