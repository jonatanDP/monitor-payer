package com.embedded.idlescreenguardian.common

object AppConstants {
    const val LOG_TAG = "SecureScreenManager"
    const val PREFS_NAME = "idle_screen_guardian_prefs"

    const val DEFAULT_TIMEOUT_MINUTES = 30
    val AVAILABLE_TIMEOUTS_MINUTES = listOf(5, 10, 30, 60)

    const val NOTIFICATION_CHANNEL_ID = "monitor_service"
    const val NOTIFICATION_CHANNEL_NAME = "Secure Screen Manager"
    const val NOTIFICATION_ID = 1107
    const val NOTIFICATION_PERMISSION_REQUEST_CODE = 3101

    const val SERVICE_RESTART_REQUEST_CODE = 2101
    const val SERVICE_RESTART_DELAY_MS = 15_000L
    const val WATCHDOG_INTERVAL_MS = 60_000L
    const val SERVICE_WATCHDOG_REQUEST_CODE = 2102
    const val MONITORING_LOOP_INTERVAL_MS = 5_000L

    const val HEARTBEAT_INTERVAL_MS = 10_000L
    const val COMMAND_POLL_INTERVAL_MS = 10_000L
    const val NETWORK_BACKOFF_INITIAL_MS = 10_000L
    const val NETWORK_BACKOFF_MAX_MS = 60_000L
    const val NETWORK_CONNECT_TIMEOUT_MS = 5_000
    const val NETWORK_READ_TIMEOUT_MS = 5_000

    const val DEFAULT_BACKEND_BASE_URL = "https://monitor-payer-backend.onrender.com"
    const val DEFAULT_API_TOKEN = ""
    const val DEFAULT_LAST_STATUS = "idle"
}
