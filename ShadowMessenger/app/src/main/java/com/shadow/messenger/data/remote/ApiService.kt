package com.shadow.messenger.data.remote

import com.shadow.messenger.domain.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // ── Auth ──────────────────────────────────────────────────────────
    @POST("api/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>

    @POST("api/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    // ── Profile ───────────────────────────────────────────────────────
    @GET("api/me")
    suspend fun getMe(): Response<User>

    @PUT("api/me")
    suspend fun updateProfile(@Body request: ProfileUpdateRequest): Response<User>

    @PUT("api/me/password")
    suspend fun changePassword(@Body body: Map<String, String>): Response<User>

    @Multipart
    @POST("api/me/avatar")
    suspend fun uploadAvatar(@Part avatar: MultipartBody.Part): Response<User>

    @GET("api/me/sessions")
    suspend fun getSessions(): Response<List<SessionInfo>>

    @POST("api/me/sessions/revoke")
    suspend fun revokeSession(@Body body: Map<String, String>): Response<Map<String, String>>

    // ── Users ─────────────────────────────────────────────────────────
    @GET("api/users/search")
    suspend fun searchUsers(@Query("q") query: String): Response<List<User>>

    @GET("api/users/{id}")
    suspend fun getUser(@Path("id") userId: String): Response<User>

    // ── Chats ─────────────────────────────────────────────────────────
    @GET("api/chats")
    suspend fun getChats(): Response<List<Chat>>

    @POST("api/chats")
    suspend fun createPrivateChat(@Body body: CreateChatRequest): Response<Chat>

    @POST("api/chats/group")
    suspend fun createGroup(@Body body: CreateGroupRequest): Response<Chat>

    @PUT("api/chats/{id}")
    suspend fun updateChat(
        @Path("id") chatId: String,
        @Body body: Map<String, String>
    ): Response<Chat>

    @POST("api/chats/{id}/members")
    suspend fun addMembers(
        @Path("id") chatId: String,
        @Body body: Map<String, List<String>>
    ): Response<Chat>

    @DELETE("api/chats/{id}")
    suspend fun deleteChat(@Path("id") chatId: String): Response<Map<String, String>>

    // ── Messages ──────────────────────────────────────────────────────
    @GET("api/chats/{id}/messages")
    suspend fun getMessages(
        @Path("id") chatId: String,
        @Query("before") before: String? = null,
        @Query("limit") limit: Int = 50
    ): Response<List<Message>>

    @POST("api/chats/{id}/messages")
    suspend fun sendMessage(
        @Path("id") chatId: String,
        @Body body: SendMessageRequest
    ): Response<Message>

    @Multipart
    @POST("api/chats/{id}/upload")
    suspend fun uploadFile(
        @Path("id") chatId: String,
        @Part file: MultipartBody.Part,
        @Part("replyTo") replyTo: RequestBody? = null
    ): Response<Message>

    @PUT("api/messages/{id}")
    suspend fun editMessage(
        @Path("id") messageId: String,
        @Body body: Map<String, String>
    ): Response<Message>

    @DELETE("api/messages/{id}")
    suspend fun deleteMessage(@Path("id") messageId: String): Response<Map<String, String>>

    @POST("api/messages/{id}/react")
    suspend fun reactToMessage(
        @Path("id") messageId: String,
        @Body body: Map<String, String>
    ): Response<Message>

    // ── Settings ──────────────────────────────────────────────────────
    @PUT("api/me")
    suspend fun updateSettings(@Body body: SettingsUpdateRequest): Response<User>
}

@kotlinx.serialization.Serializable
data class SessionInfo(
    val id: String = "",
    val device: String = "",
    val ip: String = "",
    val createdAt: String = "",
    val active: Boolean = true,
    val current: Boolean = false
)
