package com.embedded.idlescreenguardian.network

import android.content.Context
import android.util.Log
import com.embedded.idlescreenguardian.common.AppConstants
import com.embedded.idlescreenguardian.common.IdleMode
import com.embedded.idlescreenguardian.utils.SettingsManager
import com.embedded.idlescreenguardian.utils.NetworkUtils
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import org.json.JSONArray
import org.json.JSONObject

data class RemoteCommand(
    val id: String?,
    val action: String,
    val timeoutMinutes: Int?,
    val idleMode: IdleMode?,
    val monitoringEnabled: Boolean?
)

data class CommandFetchResult(
    val success: Boolean,
    val commands: List<RemoteCommand>
)

class NetworkClient(
    context: Context,
    private val settingsManager: SettingsManager
) {

    private val appContext = context.applicationContext

    fun isConfigured(): Boolean = settingsManager.getBackendBaseUrl().isNotBlank()

    fun sendHeartbeat(deviceId: String, payload: JSONObject): Boolean {
        return postJson(buildDevicePath(deviceId, "heartbeat"), payload)
    }

    fun sendStatus(deviceId: String, payload: JSONObject): Boolean {
        return putJson(buildDevicePath(deviceId, "status"), payload)
    }

    fun sendLog(deviceId: String, event: String, details: JSONObject = JSONObject()): Boolean {
        val payload = JSONObject().apply {
            put("device_id", deviceId)
            put("event", event)
            put("details", details)
        }
        return postJson("logs", payload, successCodes = setOf(
            HttpsURLConnection.HTTP_OK,
            HttpsURLConnection.HTTP_CREATED
        ))
    }

    fun registerDevice(deviceId: String): Boolean {
        if (!isConfigured()) {
            return false
        }
        if (!NetworkUtils.isNetworkAvailable(appContext)) {
            Log.w(AppConstants.LOG_TAG, "registerDevice omitido: sin conectividad")
            return false
        }

        val deviceExists = getDeviceStatusCode(deviceId)
        if (deviceExists == HttpsURLConnection.HTTP_OK) {
            Log.i(AppConstants.LOG_TAG, "Dispositivo ya existe")
            return true
        }

        if (deviceExists != HttpsURLConnection.HTTP_NOT_FOUND) {
            if (deviceExists != null) {
                logHttpError("GET", "devices/$deviceId", deviceExists)
            }
            return false
        }

        val payload = JSONObject().apply {
            put("id", deviceId)
            put("name", buildDefaultDeviceName(deviceId))
            put("status", "online")
            put("ip", "local")
            put("mode", "idle")
        }

        val created = postJson("devices", payload, successCodes = setOf(
            HttpsURLConnection.HTTP_OK,
            HttpsURLConnection.HTTP_CREATED,
            HttpsURLConnection.HTTP_CONFLICT
        ))

        if (created) {
            Log.i(AppConstants.LOG_TAG, "Dispositivo registrado")
        }
        return created
    }

    fun fetchCommands(deviceId: String): CommandFetchResult {
        if (!isConfigured()) {
            return CommandFetchResult(success = true, commands = emptyList())
        }
        if (!NetworkUtils.isNetworkAvailable(appContext)) {
            Log.w(AppConstants.LOG_TAG, "fetchCommands omitido: sin conectividad")
            return CommandFetchResult(success = false, commands = emptyList())
        }

        val connection = openConnection(
            path = buildDevicePath(deviceId, "commands"),
            method = "GET"
        ) ?: return CommandFetchResult(success = false, commands = emptyList())

        return try {
            val statusCode = connection.responseCode
            if (statusCode == HttpsURLConnection.HTTP_OK) {
                val responseBody = connection.inputStream.bufferedReader().use(BufferedReader::readText)
                CommandFetchResult(success = true, commands = parseCommands(responseBody))
            } else {
                logHttpError("GET", buildDevicePath(deviceId, "commands"), statusCode)
                CommandFetchResult(success = false, commands = emptyList())
            }
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error consultando comandos remotos", throwable)
            CommandFetchResult(success = false, commands = emptyList())
        } finally {
            connection.disconnect()
        }
    }

    fun markCommandExecuted(commandId: String): Boolean {
        if (!isConfigured()) {
            return false
        }
        if (!NetworkUtils.isNetworkAvailable(appContext)) {
            Log.w(AppConstants.LOG_TAG, "PUT /commands/$commandId/execute omitido: sin conectividad")
            return false
        }

        val connection = openConnection(
            path = "commands/$commandId/execute",
            method = "PUT"
        ) ?: return false

        return try {
            val statusCode = connection.responseCode
            val success = statusCode == HttpsURLConnection.HTTP_OK
            if (!success) {
                logHttpError("PUT", "commands/$commandId/execute", statusCode)
            }
            success
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error marcando comando ejecutado id=$commandId", throwable)
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun postJson(
        path: String,
        payload: JSONObject,
        successCodes: Set<Int> = setOf(HttpsURLConnection.HTTP_OK)
    ): Boolean {
        return sendJson("POST", path, payload, successCodes)
    }

    private fun putJson(
        path: String,
        payload: JSONObject,
        successCodes: Set<Int> = setOf(HttpsURLConnection.HTTP_OK)
    ): Boolean {
        return sendJson("PUT", path, payload, successCodes)
    }

    private fun sendJson(
        method: String,
        path: String,
        payload: JSONObject,
        successCodes: Set<Int>
    ): Boolean {
        if (!isConfigured()) {
            return false
        }
        if (!NetworkUtils.isNetworkAvailable(appContext)) {
            Log.w(AppConstants.LOG_TAG, "$method $path omitido: sin conectividad")
            return false
        }

        val connection = openConnection(path = path, method = method) ?: return false
        return try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }

            val statusCode = connection.responseCode
            val success = successCodes.contains(statusCode)
            if (!success) {
                logHttpError(method, path, statusCode)
            }
            success
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error enviando $method a $path", throwable)
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun getDeviceStatusCode(deviceId: String): Int? {
        val path = "devices/$deviceId"
        val connection = openConnection(path = path, method = "GET") ?: return null

        return try {
            connection.responseCode
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error consultando dispositivo remoto $deviceId", throwable)
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun openConnection(path: String, method: String): HttpsURLConnection? {
        val baseUrl = settingsManager.getBackendBaseUrl()
        if (baseUrl.isBlank()) {
            Log.w(AppConstants.LOG_TAG, "NetworkClient omitido: backend_base_url no configurado")
            return null
        }

        return try {
            val normalizedBaseUrl = baseUrl.trimEnd('/')
            val normalizedPath = path.trimStart('/')
            val url = URL("$normalizedBaseUrl/$normalizedPath")
            if (!url.protocol.equals("https", ignoreCase = true)) {
                Log.e(AppConstants.LOG_TAG, "URL rechazada por no usar HTTPS: $url")
                return null
            }

            (url.openConnection() as? HttpsURLConnection)?.apply {
                requestMethod = method
                connectTimeout = AppConstants.NETWORK_CONNECT_TIMEOUT_MS
                readTimeout = AppConstants.NETWORK_READ_TIMEOUT_MS
                useCaches = false
                doInput = true
                setRequestProperty("Accept", "application/json")
                if (method != "GET") {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }

                val apiToken = settingsManager.getApiToken()
                if (apiToken.isNotBlank()) {
                    setRequestProperty("Authorization", "Bearer $apiToken")
                }
            }
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "Error abriendo conexion HTTP hacia $path", throwable)
            null
        }
    }

    private fun buildDevicePath(deviceId: String, suffix: String): String {
        return "devices/$deviceId/$suffix"
    }

    private fun buildDefaultDeviceName(deviceId: String): String {
        return "Pantalla ${deviceId.take(8)}"
    }

    private fun parseCommands(responseBody: String): List<RemoteCommand> {
        if (responseBody.isBlank()) {
            return emptyList()
        }

        return try {
            when {
                responseBody.trimStart().startsWith("[") -> {
                    parseCommandsArray(JSONArray(responseBody))
                }

                else -> {
                    val payload = JSONObject(responseBody)
                    when {
                        payload.has("commands") -> parseCommandsArray(payload.optJSONArray("commands"))
                        payload.has("action") -> listOf(parseCommand(payload))
                        else -> emptyList()
                    }
                }
            }
        } catch (throwable: Throwable) {
            Log.e(AppConstants.LOG_TAG, "No fue posible parsear comandos remotos", throwable)
            emptyList()
        }
    }

    private fun parseCommandsArray(commandsArray: JSONArray?): List<RemoteCommand> {
        if (commandsArray == null) {
            return emptyList()
        }

        val commands = mutableListOf<RemoteCommand>()
        for (index in 0 until commandsArray.length()) {
            val commandJson = commandsArray.optJSONObject(index) ?: continue
            commands += parseCommand(commandJson)
        }
        return commands
    }

    private fun parseCommand(payload: JSONObject): RemoteCommand {
        val mode = payload.optString("idle_mode")
            .takeIf { it.isNotBlank() }
            ?.let {
                try {
                    IdleMode.valueOf(it)
                } catch (_: IllegalArgumentException) {
                    null
                }
            }

        return RemoteCommand(
            id = payload.optString("id").takeIf { it.isNotBlank() },
            action = payload.optString("action"),
            timeoutMinutes = payload.optInt("timeout_minutes").takeIf { it > 0 },
            idleMode = mode,
            monitoringEnabled = payload.opt("monitoring_enabled") as? Boolean
        )
    }

    private fun logHttpError(method: String, path: String, statusCode: Int) {
        when (statusCode) {
            in 400..499 -> Log.e(AppConstants.LOG_TAG, "$method $path fallo cliente HTTP=$statusCode")
            in 500..599 -> Log.e(AppConstants.LOG_TAG, "$method $path fallo servidor HTTP=$statusCode")
            else -> Log.e(AppConstants.LOG_TAG, "$method $path fallo HTTP=$statusCode")
        }
    }
}
