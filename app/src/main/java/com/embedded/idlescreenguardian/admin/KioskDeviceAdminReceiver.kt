package com.embedded.idlescreenguardian.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.embedded.idlescreenguardian.common.AppConstants

/**
 * Para activar como Device Owner por ADB en un equipo limpio:
 *
 * adb shell dpm set-device-owner com.embedded.idlescreenguardian/.admin.KioskDeviceAdminReceiver
 *
 * Verificacion:
 * adb shell dpm list-owners
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(AppConstants.LOG_TAG, "Device Admin habilitado")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.i(AppConstants.LOG_TAG, "Device Admin deshabilitado")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        Log.i(AppConstants.LOG_TAG, "Lock task mode entrando para $pkg")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        Log.i(AppConstants.LOG_TAG, "Lock task mode saliendo")
    }
}
