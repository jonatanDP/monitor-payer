package com.embedded.idlescreenguardian.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.embedded.idlescreenguardian.common.AppConstants
import com.embedded.idlescreenguardian.service.IdleService
import com.embedded.idlescreenguardian.utils.SettingsManager

class ServiceWatchdogReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val settingsManager = SettingsManager(context)
        if (!settingsManager.isMonitoringEnabled()) {
            Log.i(AppConstants.LOG_TAG, "WatchdogReceiver ignorado porque monitoreo esta deshabilitado")
            return
        }

        val now = System.currentTimeMillis()
        val heartbeatAge = now - settingsManager.getLastWatchdogHeartbeat()
        if (settingsManager.isServiceRunning() && heartbeatAge < (AppConstants.WATCHDOG_INTERVAL_MS * 2)) {
            Log.i(AppConstants.LOG_TAG, "WatchdogReceiver omitido: servicio aun reporta heartbeat reciente")
            return
        }

        Log.w(AppConstants.LOG_TAG, "WatchdogReceiver reactivando IdleService")
        IdleService.restoreState(context, "watchdog_receiver")
    }
}
