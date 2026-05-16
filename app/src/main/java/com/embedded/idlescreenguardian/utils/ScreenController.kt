package com.embedded.idlescreenguardian.utils

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.embedded.idlescreenguardian.admin.KioskDeviceAdminReceiver
import com.embedded.idlescreenguardian.common.AppConstants

class ScreenController(private val context: Context) {

    private val appContext = context.applicationContext
    private val devicePolicyManager =
        appContext.getSystemService(DevicePolicyManager::class.java)
    private val adminComponent = ComponentName(appContext, KioskDeviceAdminReceiver::class.java)

    fun isAdminActive(): Boolean = devicePolicyManager?.isAdminActive(adminComponent) == true

    fun isDeviceOwner(): Boolean = devicePolicyManager?.isDeviceOwnerApp(appContext.packageName) == true

    fun allowCurrentAppInLockTask(): Boolean {
        val manager = devicePolicyManager ?: return false
        if (!isDeviceOwner()) {
            Log.w(AppConstants.LOG_TAG, "No se puede configurar lock task: la app no es Device Owner")
            return false
        }

        return try {
            manager.setLockTaskPackages(adminComponent, arrayOf(appContext.packageName))
            Log.i(AppConstants.LOG_TAG, "Lock task configurado para ${appContext.packageName}")
            true
        } catch (securityException: SecurityException) {
            Log.e(AppConstants.LOG_TAG, "No fue posible registrar paquete para lock task", securityException)
            false
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error al configurar lock task", throwable)
            false
        }
    }

    fun isLockTaskPermitted(): Boolean =
        devicePolicyManager?.isLockTaskPermitted(appContext.packageName) == true

    fun applyDeviceOwnerPolicies(launcherComponent: ComponentName): Boolean {
        val manager = devicePolicyManager ?: return false
        if (!isDeviceOwner()) {
            Log.w(AppConstants.LOG_TAG, "applyDeviceOwnerPolicies omitido: la app no es Device Owner")
            return false
        }

        return try {
            manager.setLockTaskPackages(adminComponent, arrayOf(appContext.packageName))
            val homeIntentFilter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            manager.addPersistentPreferredActivity(
                adminComponent,
                homeIntentFilter,
                launcherComponent
            )
            try {
                manager.setStatusBarDisabled(adminComponent, true)
            } catch (throwable: Throwable) {
                Log.w(AppConstants.LOG_TAG, "No fue posible deshabilitar la barra de estado", throwable)
            }
            try {
                manager.setKeyguardDisabled(adminComponent, true)
            } catch (throwable: Throwable) {
                Log.w(AppConstants.LOG_TAG, "No fue posible deshabilitar keyguard", throwable)
            }
            Log.i(AppConstants.LOG_TAG, "Politicas Device Owner aplicadas para launcher kiosk")
            true
        } catch (securityException: SecurityException) {
            Log.e(AppConstants.LOG_TAG, "Error aplicando politicas Device Owner", securityException)
            false
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Fallo inesperado aplicando politicas Device Owner", throwable)
            false
        }
    }

    fun lockScreen(reason: String): Boolean {
        if (devicePolicyManager == null) {
            Log.e(AppConstants.LOG_TAG, "DevicePolicyManager no disponible")
            return tryFallbackGoToSleep(reason)
        }

        if (isAdminActive()) {
            return try {
                Log.i(AppConstants.LOG_TAG, "Apagando pantalla con lockNow. reason=$reason")
                devicePolicyManager.lockNow()
                true
            } catch (securityException: SecurityException) {
                Log.e(AppConstants.LOG_TAG, "lockNow() sin privilegios suficientes", securityException)
                tryFallbackGoToSleep(reason)
            } catch (throwable: Throwable) {
                Log.e(AppConstants.LOG_TAG, "Error al ejecutar lockNow()", throwable)
                tryFallbackGoToSleep(reason)
            }
        }

        Log.w(AppConstants.LOG_TAG, "Device Admin inactivo. Se intenta fallback de energia")
        return tryFallbackGoToSleep(reason)
    }

    private fun tryFallbackGoToSleep(reason: String): Boolean {
        val powerManager = appContext.getSystemService(PowerManager::class.java) ?: run {
            Log.e(AppConstants.LOG_TAG, "PowerManager no disponible")
            return false
        }

        return try {
            val method = PowerManager::class.java.getMethod("goToSleep", Long::class.javaPrimitiveType)
            method.invoke(powerManager, SystemClock.uptimeMillis())
            Log.i(AppConstants.LOG_TAG, "Fallback goToSleep() ejecutado. reason=$reason")
            true
        } catch (securityException: SecurityException) {
            Log.e(AppConstants.LOG_TAG, "goToSleep() bloqueado por permisos OEM", securityException)
            false
        } catch (reflectionError: ReflectiveOperationException) {
            Log.e(AppConstants.LOG_TAG, "goToSleep() no expuesto por este firmware", reflectionError)
            false
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error inesperado en goToSleep()", throwable)
            false
        }
    }
}
