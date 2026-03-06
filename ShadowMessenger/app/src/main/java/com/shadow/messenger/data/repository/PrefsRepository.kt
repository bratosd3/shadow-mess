package com.shadow.messenger.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore("shadow_prefs")

@Singleton
class PrefsRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val TOKEN_KEY = stringPreferencesKey("auth_token")
        private val USER_ID_KEY = stringPreferencesKey("user_id")
        private val THEME_KEY = stringPreferencesKey("theme")
        private val ACCENT_KEY = stringPreferencesKey("accent_color")
        private val FONT_SIZE_KEY = intPreferencesKey("font_size")
        private val BASE_URL_KEY = stringPreferencesKey("base_url")
    }

    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[TOKEN_KEY] }
    val userIdFlow: Flow<String?> = context.dataStore.data.map { it[USER_ID_KEY] }
    val themeFlow: Flow<String> = context.dataStore.data.map { it[THEME_KEY] ?: "dark" }
    val accentFlow: Flow<String> = context.dataStore.data.map { it[ACCENT_KEY] ?: "#7C3AED" }
    val fontSizeFlow: Flow<Int> = context.dataStore.data.map { it[FONT_SIZE_KEY] ?: 14 }
    val baseUrlFlow: Flow<String> = context.dataStore.data.map {
        it[BASE_URL_KEY] ?: com.shadow.messenger.BuildConfig.BASE_URL
    }

    suspend fun getToken(): String? = context.dataStore.data.first()[TOKEN_KEY]
    suspend fun getUserId(): String? = context.dataStore.data.first()[USER_ID_KEY]
    suspend fun getBaseUrl(): String = context.dataStore.data.first()[BASE_URL_KEY]
        ?: com.shadow.messenger.BuildConfig.BASE_URL

    suspend fun saveAuth(token: String, userId: String) {
        context.dataStore.edit {
            it[TOKEN_KEY] = token
            it[USER_ID_KEY] = userId
        }
    }

    suspend fun clearAuth() {
        context.dataStore.edit {
            it.remove(TOKEN_KEY)
            it.remove(USER_ID_KEY)
        }
    }

    suspend fun saveTheme(theme: String) {
        context.dataStore.edit { it[THEME_KEY] = theme }
    }

    suspend fun saveAccent(color: String) {
        context.dataStore.edit { it[ACCENT_KEY] = color }
    }

    suspend fun saveFontSize(size: Int) {
        context.dataStore.edit { it[FONT_SIZE_KEY] = size }
    }

    suspend fun saveBaseUrl(url: String) {
        context.dataStore.edit { it[BASE_URL_KEY] = url }
    }
}
