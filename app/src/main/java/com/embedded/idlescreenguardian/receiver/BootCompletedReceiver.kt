package com.embedded.idlescreenguardian.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.embedded.idlescreenguardian.common.AppConstants
import com.embedded.idlescreenguardian.service.IdleService
import com.embedded.idlescreenguardian.utils.ScreenController
import com.embedded.idlescreenguardian.utils.SettingsManager

class BootCompletedReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (
            intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        val settingsManager = SettingsManager(context)
        val screenController = ScreenController(context)
        if (!settingsManager.isMonitoringEnabled()) {
            Log.i(AppConstants.LOG_TAG, "Receiver de arranque recibido pero monitoreo esta deshabilitado")
            return
        }
        if (!screenController.isDeviceOwner()) {
            Log.w(AppConstants.LOG_TAG, "Receiver de arranque omitido: Device Owner no activo")
            return
        }

        Log.i(AppConstants.LOG_TAG, "Receiver ${intent.action} recibido. Iniciando IdleService")
        IdleService.handleBootEvent(context, intent.action ?: "boot_receiver")
    }
}
