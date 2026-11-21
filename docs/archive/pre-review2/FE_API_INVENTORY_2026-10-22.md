# Kiểm kê chức năng FE và API hiện có — 22/10/2026

## Phạm vi và nguồn bằng chứng

- FE source: main `02c663b` (PR #29), đã đồng bộ 156 file source vào MAVIS-Frontend. Không build/restart FE mới trong lần lập plan này; bản đang chạy không được dùng làm bằng chứng rằng các màn mới đã nối xong.
- Backend khảo sát: OpenAPI Java đang chạy tại localhost:8081 (88 operation); Swagger Worker localhost:5082 (10 operation). Đây là inventory được công bố, không phải 98 nghiệp vụ đã pass authenticated E2E.
- FE `contracts.ts`: 39 operation adapter. Bốn route mainflow /import, /architecture, /impact, /explain giữ nhánh live cũ khi MAVIS_API_MODE=backend; các feature component mới đi qua adapter chung. Default mode trong config/.env.example là mock.
- Bản chụp và inventory máy đọc: `.doc_review/fe-api-plan-20261022/{java-openapi.json,worker-openapi.json,api-inventory.json}`. Không có token/password trong các file này.
- Route inventory: 15 screen cấu hình chung + 9 màn admin + 9 entry khác (home/login/profile/submission detail/4 mainflow/design system): 33 entry logic, có màn dùng chung component, không phải 33 nghiệp vụ độc lập.

## Chức năng, API tương ứng và tình trạng

### 1. Đăng nhập, session, profile
- Màn: /login; /profile.
- FE operation: session, mockLogin, signOut.
- Tình trạng: Login thật hiện nằm trong FlowFrame của mainflow cũ; /login mới chỉ chọn sample role hoặc thông báo chưa cấu hình ở backend mode. /profile đọc session, chưa có cập nhật profile.
- API hiện có: POST /api/v1/auth/login; register; verify-email; resend-otp; forgot-password; reset-password; google. Chưa có /auth/me và logout/revoke trong OpenAPI.
- Việc cần làm: P0: tái sử dụng cookie HttpOnly đã có, thêm session user/role đã kiểm chứng; mockLogin chỉ dành mock. Logout local không đồng nghĩa revoke JWT toàn hệ thống.

### 2. Project và dashboard
- Màn: /; /project-overview.
- FE operation: projects, project.
- Tình trạng: Màn mới có danh sách, filter/page phía client và overview; adapter chung chưa có mapping Java xác nhận. Mainflow cũ đã có chọn/tạo project thật.
- API hiện có: GET/POST /api/v1/projects; GET/PUT/DELETE /api/v1/projects/{id}; GET /api/v1/workspaces/{workspaceId}/projects.
- Việc cần làm: P1: DTO ProjectResponseDTO khác projectSchema (repository/status/services/runtimeSupported). Không tự gán services=0 hoặc runtimeSupported=true khi chưa biết.

### 3. Source snapshots và import
- Màn: /snapshots; /import.
- FE operation: snapshots, importSource; GitHub nằm trong mainflow cũ, chưa có operation riêng trong contracts.ts mới.
- Tình trạng: ZIP/GitHub/analyze đã chạy thật ở nhánh backend của /import. Giao diện adapter mới có ZIP và validation mẫu; chưa có GitHub operation. Contract ZIP mới cho 200 MB trong khi BE đang 100 MB.
- API hiện có: POST /api/v1/analyzer/upload?projectId=UUID (multipart file); POST /api/v1/analyzer/import/github (JSON projectId, repositoryUrl, branchName, commitSha). Chưa có list/detail snapshot tổng quát theo project trong 88 API.
- Việc cần làm: P1: giữ luồng thật, thêm operation GitHub typed; P2: bổ sung list/detail snapshot và validation unknown/pending. Import thành công không chứng minh ZIP hợp lệ/evidence đầy đủ.

### 4. Analysis jobs và history
- Màn: /import; /analysis-history.
- FE operation: analysisJobs, startAnalysis, analysisJob.
- Tình trạng: Luồng cũ có Idempotency-Key, cancel và refresh-safe job URL. Hook mới chỉ poll queued/processing/running; schema thiếu cancelled/cancelling/timed-out và review/partial.
- API hiện có: POST /api/v1/analyzer/snapshots/{snapshot}/analyze; GET /api/v1/analyzer/projects/{projectId}/jobs; GET /api/v1/analyzer/jobs/{jobId}; GET /api/v1/analyzer/jobs/{job}/attempts; POST /api/v1/analyzer/jobs/{job}/cancel.
- Việc cần làm: P1: map trạng thái và analysisState riêng, progress nullable/indeterminate, key giữ qua retry, bổ sung cancel operation và pin job/project/snapshot.

### 5. Graph, model và evidence
- Màn: /architecture; /diagrams.
- FE operation: models, model; evidence/diagram chưa là operation riêng trong contracts.ts.
- Tình trạng: /architecture backend dùng ModelFlow thật. /diagrams đi trực tiếp ArchitectureWorkspace của adapter mới, không tự dùng nhánh live. Graph mới dùng modelSchema yêu cầu elements/edges/evidence/layer.
- API hiện có: GET /api/v1/analyzer/projects/{projectId}/models; GET /api/v1/analyzer/models/{modelVersionId}; GET /api/v1/analyzer/models/{sessionId}/graph (tham số thực là model UUID); GET /api/v1/analyzer/evidences/element/{elementId}; GET /api/v1/analyzer/evidences/relationship/{relationshipId}; GET /api/v1/analyzer/models/{modelVersionId}/diagrams; GET /api/v1/analyzer/diagrams/{diagramId}; GET /api/v1/analyzer/diagrams/{diagramId}/export; POST deployment; PUT layout.
- Việc cần làm: P2: list model metadata riêng, lazy graph/evidence của model được chọn; giữ UUID/type/sourcePath; thêm unclassified thay vì đoán layer. /diagrams cần nối riêng, không chỉ đổi env.

### 6. Revision và compare
- Màn: /model; /compare.
- FE operation: saveModel; compare hiện dựa model objects trong FE.
- Tình trạng: Editor sửa description + expectedRevision nhưng Java nhận base model UUID và delta elements/relationships. models.at(-1) không chứng minh latest nếu chưa thống nhất sort.
- API hiện có: POST /api/v1/analyzer/models/{baseModelVersionId}/revisions; GET /api/v1/analyzer/models/compare?baseVersionId=UUID&targetVersionId=UUID.
- Việc cần làm: P3: modifiedElements dùng id/name/newName/status/languageStack/scope/properties, không gửi DTO FE nguyên xi. Cần đọc properties/description thật; chốt stale-base là conflict hay tạo nhánh, không giả định có expectedRevision API.

### 7. Evaluation và findings
- Màn: Chưa có màn evaluation chuyên biệt; có score trong submission.
- FE operation: Chưa có operation evaluate/findings riêng.
- Tình trạng: BE có API, FE mới chưa bao phủ đầy đủ.
- API hiện có: POST /api/v1/analyzer/models/{modelVersionId}/evaluate; GET /api/v1/analyzer/models/{modelVersionId}/evaluations; GET /api/v1/analyzer/evaluations/{evaluationRunId}; GET /api/v1/analyzer/evaluations/{evaluationRunId}/findings.
- Việc cần làm: P3: thêm section nhỏ trong model/detail trước khi làm màn riêng; pin evaluationRunId để export/submission.

### 8. Impact và giải thích
- Màn: /impact; /explain.
- FE operation: impact, explain.
- Tình trạng: Hai route có nhánh ModelFlow thật ở backend mode; adapter mới vẫn cần translator và schema mới cho limits/provider/evidence.
- API hiện có: GET /api/v1/analyzer/models/{model}/impact?targetServiceId=UUID; POST /api/v1/analyzer/ai/explain; GET /api/v1/analyzer/models/{modelVersionId}/ai-explanations; GET /api/v1/analyzer/ai/explanations/{explanationId}.
- Việc cần làm: P2: SERVICE_CONTAINER, giữ confirmed-edge exclusions; providerMode/cache/fallback/epistemicBadge độc lập sample flag. Không bỏ cảnh báo khi map paths.

### 9. Runtime configuration và scenario
- Màn: /runtime-config; /scenarios.
- FE operation: runtimeConfiguration, saveRuntimeConfiguration, scenarios, saveScenario.
- Tình trạng: Có form/confirm/revision ở FE mẫu; chưa có registry/list/save config/scenario tương ứng trong OpenAPI Java.
- API hiện có: POST /api/v1/analyzer/runtime/preflight?snapshotId=UUID; session create nhận scenarioConfig/profileName và các version IDs; không tương đương CRUD registry.
- Việc cần làm: P4: chọn cấu hình operator đã cấp và read-only capability trước, hoặc bổ sung BE registry/version contracts. Không tự sinh profileVersionId/runConfigurationVersionId/scenarioVersionId chỉ để qua validation.

### 10. Runtime execution và traces
- Màn: /sessions; /administration/admin-sessions.
- FE operation: runtimeSessions, runtimeSession, startRuntime, stopRuntime.
- Tình trạng: FE gộp một status/outcome; Java có execution/scenario/evidence/cleanup/trace/mapping riêng. FE có cancel/terminate nhưng Java stop không có body action. Admin wildcard projectId=* không phải endpoint Java.
- API hiện có: POST /api/v1/analyzer/runtime/sessions; POST approve; POST stop; GET session; GET /api/v1/analyzer/projects/{projectId}/runtime-sessions; GET /api/v1/analyzer/runtime/sessions/{sessionId}/sequence.
- Việc cần làm: P4: preflight → create → approve → READY_FOR_DISPATCH → Runner allocation/running/receipt; phải có operator/dispatcher thực. Chỉ một Stop đúng semantics cho tới khi BE có terminate riêng; trace thiếu thì hiển thị thiếu.

### 11. Workspace, member và assignment
- Màn: /workspaces; /workspace-overview; /members; /assignments.
- FE operation: workspaces, assignments.
- Tình trạng: WorkspaceMembers đang đọc members từ workspace object; Java list workspace chỉ trả memberCount/myRole, members ở endpoint riêng. Một số màn chỉ đọc, không có form CRUD đầy đủ.
- API hiện có: GET/POST /api/v1/workspaces; GET/PUT /api/v1/workspaces/{id}; PATCH archive; GET/POST members; POST members/batch; DELETE member; GET/POST workspace assignments; GET/PUT/DELETE assignment.
- Việc cần làm: P5 (sau ưu tiên mainflow): lazy members, resource RBAC, map nullable date/description. API tồn tại không đồng nghĩa FE đã có mọi nút quản lý.

### 12. Reference sources
- Màn: /references.
- FE operation: referenceVersions.
- Tình trạng: FE mong snapshot + full model; Java trả các source snapshot đã publish.
- API hiện có: GET /api/v1/workspaces/{workspaceId}/reference-snapshots; PATCH /api/v1/projects/{projectId}/snapshots/{snapshotId}/publish.
- Việc cần làm: P5: ghép model đúng sourceSnapshotId, không lấy latest model ngẫu nhiên của project. Verify quyền publish và tính bất biến.

### 13. Submission và feedback
- Màn: /submissions; /submissions/{submissionId}.
- FE operation: submissions, submission, submit, feedback.
- Tình trạng: FE mong frozen nested model/snapshot/runtime/feedback; Java metadata + export + feedback tách. Request submit mới thiếu projectId/diagramVersionId bắt buộc; không có GET submissions toàn hệ thống/my submissions chung.
- API hiện có: POST /api/v1/submissions; GET /api/v1/submissions/{submissionId}; GET /api/v1/submissions/{submissionId}/export; GET /api/v1/projects/{projectId}/submissions; GET /api/v1/assignments/{assignmentId}/submissions; GET/POST submission feedbacks; PUT/DELETE /api/v1/feedbacks/{feedbackId}.
- Việc cần làm: P5: scope list theo project/assignment hoặc thêm my-list. Submit pin model/diagram/evaluation/runtime; feedback POST commentText và trả FeedbackDTO, cần reread composition để thành view FE.

### 14. Admin account và audit
- Màn: /administration/users; /administration/audit.
- FE operation: accounts, setAccountLock, audit.
- Tình trạng: Có read/list + confirm lock/unlock FE mẫu. Role/status FE không trùng trực tiếp Java.
- API hiện có: GET /api/v1/admin/users; PATCH /api/v1/admin/users/{userId}/status; PATCH /api/v1/admin/users/{userId}/role; GET /api/v1/admin/audit-logs.
- Việc cần làm: P6: bảo toàn status thật, map locked → newStatus đã thống nhất; không tự đặt LOCKED khi API không hỗ trợ. Mutation admin/audit cần server authorization.

### 15. Admin integrations và profiles
- Màn: /administration/integrations; /administration/profiles.
- FE operation: integrations, configureIntegration, profiles, configureProfile.
- Tình trạng: Có UI mẫu nhưng chưa thấy API registry tương ứng trong 88 API. Không lấy việc config server có key làm bằng chứng có API UI quản lý.
- API hiện có: Chưa có endpoint list/save integration và profile trong bản OpenAPI khảo sát.
- Việc cần làm: P6 tùy chọn: bổ sung BE hoặc để unavailable/read-only rõ ràng. Không lưu secret qua browser hay giả revision để form thành công.

### 16. Admin jobs, health, usage và runtime summary
- Màn: /administration/jobs; /administration/health; /administration/usage; /administration/runtime-summary.
- FE operation: adminJobs, platformSummary.
- Tình trạng: Health/usage/runtime-summary cùng component PlatformSummary. Java stats trả tổng số, không cung cấp health status/running sessions như schema FE; jobs hiện chỉ list theo project.
- API hiện có: GET /api/v1/admin/dashboard-stats; GET /api/v1/system/ping; GET project jobs/runtime sessions. Chưa có global admin jobs/sessions list trong snapshot OpenAPI.
- Việc cần làm: P6: totals đúng nghĩa, unknown cho health/telemetry chưa có; cần API aggregate/global scope nếu muốn màn toàn hệ thống. Ping Java không chứng minh Worker/DB/AI/SMTP đều khỏe.

### 17. Design system
- Màn: /design-system.
- FE operation: Không phải business API.
- Tình trạng: Giữ preview riêng, không dùng sample state làm trạng thái sản phẩm.
- API hiện có: Không cần API business.
- Việc cần làm: Ngoài scope nối API.

## Các điểm chặn nối API đã xác định

1. Hai hệ auth: FlowFrame dùng `/api/backend` + mavis_session chứa JWT HttpOnly; `/login` mới chưa login thật, `session` mới cần `{user:{id,name,role}}` thay vì boolean.
2. `/api/mavis/[operation]` hiện chỉ forward cookie, không chuyển JWT thành Authorization Bearer; route map tĩnh không nội suy path IDs và không unwrap `ApiResponse.data`. `validateResponse` đang đòi đúng DTO FE nên trả 502 nếu cấp nguyên JSON Java.
3. Hai QueryClient/provider và hai kiểu selection (URL project/model của mainflow, SelectionContext của feature mới) chưa thống nhất; có nguy cơ chọn project ở màn này nhưng màn kia không có context.
4. Kiểm Origin của proxy mới dùng request.nextUrl.origin; mainflow trước đã cần dùng origin từ host thực để chạy 127.0.0.1/localhost. Cần có regression cho đúng deployment host.
5. DTO FE bắt buộc progress, evidenceComplete, valid/invalid/unsupported, layer, runtimeSupported mà Java chưa cung cấp chắc chắn. Không lấp bằng giá trị giả; cần sửa view schema cho unknown/pending/partial và lazy data.
6. Runtime UI thiếu READY_FOR_DISPATCH/ALLOCATED/CANCELLING và trạng thái cleanup/quality độc lập. Source service Java approve đặt READY_FOR_DISPATCH; chưa phải bằng chứng Docker RUNNING.
7. Bản docs api-integration.md có mô tả bảo mật baseline cũ; không dùng dòng nói permit-all làm quyết định cho cloud hiện tại. Cloud strict JWT và resource policy đã được kiểm thử ở các lượt trước; quyền từng operation mới vẫn cần kiểm lại.

## Inventory HTTP đầy đủ

Danh sách dưới đây chép từ OpenAPI runtime. DTO refs chỉ định wire schema; không suy rằng path có trong Swagger là endpoint được phép gọi từ FE.

### Java
- **GET /api/v1/workspaces/{id}**
  - Parameters: path:id (required). Request: không body schema. Success response: ApiResponseWorkspaceResponseDTO.
- **PUT /api/v1/workspaces/{id}**
  - Parameters: path:id (required). Request: WorkspaceUpdateRequest. Success response: ApiResponseWorkspaceResponseDTO.
- **GET /api/v1/projects/{id}**
  - Parameters: path:id (required). Request: không body schema. Success response: ApiResponseProjectResponseDTO.
- **PUT /api/v1/projects/{id}**
  - Parameters: path:id (required). Request: ProjectUpdateRequest. Success response: ApiResponseProjectResponseDTO.
- **DELETE /api/v1/projects/{id}**
  - Parameters: path:id (required). Request: không body schema. Success response: ApiResponseVoid.
- **PUT /api/v1/feedbacks/{feedbackId}**
  - Parameters: path:feedbackId (required). Request: FeedbackUpdateRequest. Success response: ApiResponseFeedbackResponseDTO.
- **DELETE /api/v1/feedbacks/{feedbackId}**
  - Parameters: path:feedbackId (required). Request: không body schema. Success response: ApiResponseVoid.
- **GET /api/v1/assignments/{assignmentId}**
  - Parameters: path:assignmentId (required). Request: không body schema. Success response: ApiResponseAssignmentResponseDTO.
- **PUT /api/v1/assignments/{assignmentId}**
  - Parameters: path:assignmentId (required). Request: AssignmentUpdateRequest. Success response: ApiResponseAssignmentResponseDTO.
- **DELETE /api/v1/assignments/{assignmentId}**
  - Parameters: path:assignmentId (required). Request: không body schema. Success response: ApiResponseVoid.
- **PUT /api/v1/analyzer/diagrams/{diagramId}/layout**
  - Parameters: path:diagramId (required). Request: JsonNode. Success response: ApiResponseDiagramResponseDTO.
- **GET /api/v1/workspaces**
  - Parameters: không khai báo. Request: không body schema. Success response: ApiResponseListWorkspaceResponseDTO.
- **POST /api/v1/workspaces**
  - Parameters: không khai báo. Request: WorkspaceCreateRequest. Success response: ApiResponseWorkspaceResponseDTO.
- **GET /api/v1/workspaces/{workspaceId}/members**
  - Parameters: path:workspaceId (required). Request: không body schema. Success response: ApiResponseListWorkspaceMemberResponseDTO.
- **POST /api/v1/workspaces/{workspaceId}/members**
  - Parameters: path:workspaceId (required). Request: AddWorkspaceMemberRequest. Success response: ApiResponseWorkspaceMemberResponseDTO.
- **POST /api/v1/workspaces/{workspaceId}/members/batch**
  - Parameters: path:workspaceId (required). Request: BatchAddMembersRequest. Success response: ApiResponseBatchAddMembersResponseDTO.
- **GET /api/v1/workspaces/{workspaceId}/assignments**
  - Parameters: path:workspaceId (required). Request: không body schema. Success response: ApiResponseListAssignmentResponseDTO.
- **POST /api/v1/workspaces/{workspaceId}/assignments**
  - Parameters: path:workspaceId (required). Request: AssignmentCreateRequest. Success response: ApiResponseAssignmentResponseDTO.
- **POST /api/v1/submissions**
  - Parameters: không khai báo. Request: SubmissionCreateRequest. Success response: ApiResponseSubmissionResponseDTO.
- **GET /api/v1/submissions/{submissionId}/feedbacks**
  - Parameters: path:submissionId (required). Request: không body schema. Success response: ApiResponseListFeedbackResponseDTO.
- **POST /api/v1/submissions/{submissionId}/feedbacks**
  - Parameters: path:submissionId (required). Request: FeedbackCreateRequest. Success response: ApiResponseFeedbackResponseDTO.
- **GET /api/v1/projects**
  - Parameters: không khai báo. Request: không body schema. Success response: ApiResponseListProjectResponseDTO.
- **POST /api/v1/projects**
  - Parameters: không khai báo. Request: ProjectCreateRequest. Success response: ApiResponseProjectResponseDTO.
- **POST /api/v1/auth/verify-email**
  - Parameters: không khai báo. Request: VerifyEmailRequest. Success response: ApiResponseVoid.
- **POST /api/v1/auth/reset-password**
  - Parameters: không khai báo. Request: ResetPasswordRequest. Success response: ApiResponseVoid.
- **POST /api/v1/auth/resend-otp**
  - Parameters: không khai báo. Request: ResendOtpRequest. Success response: ApiResponseVoid.
- **POST /api/v1/auth/register**
  - Parameters: không khai báo. Request: RegisterRequest. Success response: ApiResponseRegisterResponse.
- **POST /api/v1/auth/login**
  - Parameters: không khai báo. Request: LoginRequest. Success response: ApiResponseAuthResponse.
- **POST /api/v1/auth/google**
  - Parameters: không khai báo. Request: GoogleLoginRequest. Success response: ApiResponseAuthResponse.
- **POST /api/v1/auth/forgot-password**
  - Parameters: không khai báo. Request: ForgotPasswordRequest. Success response: ApiResponseVoid.
- **POST /api/v1/analyzer/upload**
  - Parameters: query:projectId (required). Request: multipart/form-data. Success response: ApiResponseIngestionResponseDTO.
- **POST /api/v1/analyzer/snapshots/{snapshot}/analyze**
  - Parameters: path:snapshot (required); header:Idempotency-Key. Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **POST /api/v1/analyzer/runtime/sessions**
  - Parameters: không khai báo. Request: RuntimeSessionCreateRequest. Success response: ApiResponseRuntimeSessionResponseDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/sync-outbox**
  - Parameters: path:sessionId (required); query:resourceProject. Request: không body schema. Success response: ApiResponseRuntimeSessionResponseDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/stop**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseRuntimeSessionResponseDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/lifecycle-ack**
  - Parameters: path:sessionId (required). Request: RuntimeSessionLifecycleAckRequestDTO. Success response: ApiResponseRuntimeSessionLifecycleAckDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-traces**
  - Parameters: path:sessionId (required); query:baseModelVersionId (required). Request: RuntimeTraceIngestRequestDTO. Success response: ApiResponseModelVersionResponseDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt**
  - Parameters: path:sessionId (required). Request: RunnerReceiptIngestRequestDTO. Success response: ApiResponseModelVersionResponseDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/ingest-receipt-ack**
  - Parameters: path:sessionId (required). Request: RunnerReceiptIngestRequestDTO. Success response: ApiResponseReceiptIngestAckDTO.
- **POST /api/v1/analyzer/runtime/sessions/{sessionId}/approve**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseRuntimeSessionResponseDTO.
- **POST /api/v1/analyzer/runtime/sessions/{id}/recovery-result**
  - Parameters: path:id (required). Request: Result. Success response: ApiResponseAck.
- **POST /api/v1/analyzer/runtime/preflight**
  - Parameters: query:snapshotId (required). Request: không body schema. Success response: ApiResponsePreflightCheckResponseDTO.
- **POST /api/v1/analyzer/models/{modelVersionId}/evaluate**
  - Parameters: path:modelVersionId (required); query:ruleSetVersion. Request: không body schema. Success response: ApiResponseEvaluationRunResponseDTO.
- **POST /api/v1/analyzer/models/{modelVersionId}/diagrams/deployment**
  - Parameters: path:modelVersionId (required). Request: không body schema. Success response: ApiResponseDiagramResponseDTO.
- **POST /api/v1/analyzer/models/{baseModelVersionId}/revisions**
  - Parameters: path:baseModelVersionId (required). Request: ModelRevisionRequestDTO. Success response: ApiResponseModelVersionResponseDTO.
- **POST /api/v1/analyzer/jobs/{job}/cancel**
  - Parameters: path:job (required). Request: không body schema. Success response: ApiResponseObject.
- **POST /api/v1/analyzer/import/github**
  - Parameters: không khai báo. Request: GitHubImportRequest. Success response: ApiResponseIngestionResponseDTO.
- **POST /api/v1/analyzer/ai/explain**
  - Parameters: không khai báo. Request: AiExplainRequestDTO. Success response: ApiResponseAiExplanationResponseDTO.
- **PATCH /api/v1/workspaces/{id}/archive**
  - Parameters: path:id (required). Request: không body schema. Success response: ApiResponseWorkspaceResponseDTO.
- **PATCH /api/v1/projects/{projectId}/snapshots/{snapshotId}/publish**
  - Parameters: path:projectId (required); path:snapshotId (required). Request: không body schema. Success response: ApiResponseSourceSnapshotResponseDTO.
- **PATCH /api/v1/admin/users/{userId}/status**
  - Parameters: path:userId (required). Request: UserStatusUpdateRequest. Success response: ApiResponseAdminUserResponseDTO.
- **PATCH /api/v1/admin/users/{userId}/role**
  - Parameters: path:userId (required). Request: UserRoleUpdateRequest. Success response: ApiResponseAdminUserResponseDTO.
- **GET /api/v1/workspaces/{workspaceId}/reference-snapshots**
  - Parameters: path:workspaceId (required). Request: không body schema. Success response: ApiResponseListSourceSnapshotResponseDTO.
- **GET /api/v1/workspaces/{workspaceId}/projects**
  - Parameters: path:workspaceId (required). Request: không body schema. Success response: ApiResponseListProjectResponseDTO.
- **GET /api/v1/system/ping**
  - Parameters: không khai báo. Request: không body schema. Success response: ApiResponseString.
- **GET /api/v1/submissions/{submissionId}**
  - Parameters: path:submissionId (required). Request: không body schema. Success response: ApiResponseSubmissionResponseDTO.
- **GET /api/v1/submissions/{submissionId}/export**
  - Parameters: path:submissionId (required). Request: không body schema. Success response: ApiResponseSubmissionExportBundleDTO.
- **GET /api/v1/projects/{projectId}/submissions**
  - Parameters: path:projectId (required). Request: không body schema. Success response: ApiResponseListSubmissionResponseDTO.
- **GET /api/v1/assignments/{assignmentId}/submissions**
  - Parameters: path:assignmentId (required). Request: không body schema. Success response: ApiResponseListSubmissionResponseDTO.
- **GET /api/v1/analyzer/sessions/{sessionId}/graph**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseGraphDataDTO.
- **GET /api/v1/analyzer/models/{sessionId}/graph**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseGraphDataDTO.
- **GET /api/v1/analyzer/runtime/sessions/{sessionId}**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseRuntimeSessionResponseDTO.
- **GET /api/v1/analyzer/runtime/sessions/{sessionId}/sequence**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseSequenceDiagramResponseDTO.
- **GET /api/v1/analyzer/runtime/sessions/{sessionId}/run-definition**
  - Parameters: path:sessionId (required). Request: không body schema. Success response: ApiResponseRunnerDefinitionExportDTO.
- **GET /api/v1/analyzer/projects/{projectId}/runtime-sessions**
  - Parameters: path:projectId (required). Request: không body schema. Success response: ApiResponseListRuntimeSessionResponseDTO.
- **GET /api/v1/analyzer/projects/{projectId}/models**
  - Parameters: path:projectId (required). Request: không body schema. Success response: ApiResponseListModelVersionResponseDTO.
- **GET /api/v1/analyzer/projects/{projectId}/jobs**
  - Parameters: path:projectId (required). Request: không body schema. Success response: ApiResponseListJobResponseDTO.
- **GET /api/v1/analyzer/models/{model}/impact**
  - Parameters: path:model (required); query:targetServiceId (required); query:graphRevisionId; query:maxDepth; query:maxPaths. Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **GET /api/v1/analyzer/models/{modelVersionId}**
  - Parameters: path:modelVersionId (required). Request: không body schema. Success response: ApiResponseModelVersionResponseDTO.
- **GET /api/v1/analyzer/models/{modelVersionId}/evaluations**
  - Parameters: path:modelVersionId (required). Request: không body schema. Success response: ApiResponseListEvaluationRunResponseDTO.
- **GET /api/v1/analyzer/models/{modelVersionId}/diagrams**
  - Parameters: path:modelVersionId (required). Request: không body schema. Success response: ApiResponseListDiagramResponseDTO.
- **GET /api/v1/analyzer/models/{modelVersionId}/ai-explanations**
  - Parameters: path:modelVersionId (required). Request: không body schema. Success response: ApiResponseListAiExplanationResponseDTO.
- **GET /api/v1/analyzer/models/compare**
  - Parameters: query:baseVersionId (required); query:targetVersionId (required). Request: không body schema. Success response: ApiResponseModelDiffResponseDTO.
- **GET /api/v1/analyzer/jobs/{job}/attempts**
  - Parameters: path:job (required). Request: không body schema. Success response: ApiResponseObject.
- **GET /api/v1/analyzer/jobs/{jobId}**
  - Parameters: path:jobId (required). Request: không body schema. Success response: ApiResponseJobResponseDTO.
- **GET /api/v1/analyzer/impact**
  - Parameters: query:sessionId (required); query:nodeId (required). Request: không body schema. Success response: ApiResponseImpactAnalysisResponseDTO.
- **GET /api/v1/analyzer/impact/simple**
  - Parameters: query:sessionId (required); query:nodeId (required). Request: không body schema. Success response: ApiResponseListNodeDTO.
- **GET /api/v1/analyzer/evidences/relationship/{relationshipId}**
  - Parameters: path:relationshipId (required). Request: không body schema. Success response: ApiResponseListEvidenceResponseDTO.
- **GET /api/v1/analyzer/evidences/element/{elementId}**
  - Parameters: path:elementId (required). Request: không body schema. Success response: ApiResponseListEvidenceResponseDTO.
- **GET /api/v1/analyzer/evaluations/{evaluationRunId}**
  - Parameters: path:evaluationRunId (required). Request: không body schema. Success response: ApiResponseEvaluationRunResponseDTO.
- **GET /api/v1/analyzer/evaluations/{evaluationRunId}/findings**
  - Parameters: path:evaluationRunId (required). Request: không body schema. Success response: ApiResponseListEvaluationFindingResponseDTO.
- **GET /api/v1/analyzer/diagrams/{diagramId}**
  - Parameters: path:diagramId (required). Request: không body schema. Success response: ApiResponseDiagramResponseDTO.
- **GET /api/v1/analyzer/diagrams/{diagramId}/export**
  - Parameters: path:diagramId (required); query:format. Request: không body schema. Success response: ApiResponseDiagramExportResponseDTO.
- **GET /api/v1/analyzer/ai/explanations/{explanationId}**
  - Parameters: path:explanationId (required). Request: không body schema. Success response: ApiResponseAiExplanationResponseDTO.
- **GET /api/v1/admin/users**
  - Parameters: không khai báo. Request: không body schema. Success response: ApiResponseListAdminUserResponseDTO.
- **GET /api/v1/admin/dashboard-stats**
  - Parameters: không khai báo. Request: không body schema. Success response: ApiResponseAdminDashboardStatsDTO.
- **GET /api/v1/admin/audit-logs**
  - Parameters: không khai báo. Request: không body schema. Success response: ApiResponseListAuditLogResponseDTO.
- **DELETE /api/v1/workspaces/{workspaceId}/members/{userId}**
  - Parameters: path:workspaceId (required); path:userId (required). Request: không body schema. Success response: ApiResponseVoid.
### Worker
- **POST /api/analysis**
  - Parameters: không khai báo. Request: AnalysisRequest. Success response: object/primitive; phải xác minh payload thực.
- **POST /api/v1/dotnet/analyze**
  - Parameters: không khai báo. Request: ScopedDotnetRequest. Success response: object/primitive; phải xác minh payload thực.
- **POST /api/v1/dotnet/jobs**
  - Parameters: không khai báo. Request: ScopedDotnetRequest. Success response: object/primitive; phải xác minh payload thực.
- **GET /api/v1/dotnet/jobs/{jobId}**
  - Parameters: path:jobId (required); query:attemptId. Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **POST /api/v1/dotnet/jobs/{jobId}/cancel**
  - Parameters: path:jobId (required); query:attemptId. Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **GET /api/health**
  - Parameters: không khai báo. Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **POST /api/Jobs/submit**
  - Parameters: không khai báo. Request: AnalysisRequest. Success response: object/primitive; phải xác minh payload thực.
- **GET /api/Jobs/{jobId}**
  - Parameters: path:jobId (required). Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **GET /api/health/ready**
  - Parameters: không khai báo. Request: không body schema. Success response: object/primitive; phải xác minh payload thực.
- **POST /api/v1/impact**
  - Parameters: không khai báo. Request: VersionedImpactRequest. Success response: object/primitive; phải xác minh payload thực.

### Ranh giới nội bộ
- Worker: health/ready phục vụ vận hành; /api/v1/dotnet/analyze và /jobs + /api/v1/impact dành Java→Worker có service key/grant. Legacy /api/analysis và /api/Jobs còn được quảng bá nhưng mặc định có thể bị khóa; không chọn làm contract FE mới.
- Java runtime run-definition, sync-outbox, lifecycle-ack, ingest-traces/receipt/receipt-ack/recovery-result là bridge/operator/Runner. Không đưa key/grant/receipt nội bộ xuống browser. Các route graph alias/impact cũ nên dùng versioned route đã pin model trong tính năng mới.

## Đủ căn cứ / chưa có căn cứ
- Đủ để lập plan adapter và xác định gap; các mainflow cũ có bằng chứng Petclinic/eShop ở tài liệu MAINFLOW_INTEGRATION.md.
- Chưa thực hiện regression/full browser acceptance cho FE #29, chưa bật 39 operation backend và chưa đổi dữ liệu cloud trong lần audit này. Các API chưa thấy chỉ được kết luận là không có trong source/OpenAPI đã khảo sát; endpoint đề xuất trong plan không phải endpoint đang chạy.

## Source đối chiếu trực tiếp

- FE: src/lib/api/contracts.ts; backend-adapter.ts; validate-response.ts; config.ts; app/api/mavis/[operation]/route.ts; src/types/domain.ts.
- Route/state: app/[screen]/page.tsx; app/administration/[screen]/page.tsx; app/login/page.tsx; src/routes/{import,architecture,impact,explain,index}.tsx; src/providers/app-provider.tsx; src/hooks/use-api.ts; src/components/mainflow/*.tsx.
- Java thực thi: RuntimeSessionController/RuntimeSessionServiceImpl và các DTO runtime; AuthServiceImpl; OpenAPI runtime đã chụp. DTO revision/submission/feedback/admin được đọc từ schema runtime. Các docs FE baseline chỉ là tham khảo, không dùng làm chứng cứ API đã nối.
- Quyền chung: Java business routes ở cloud dùng JWT/resource policy; các auth entrypoint là luồng lấy/xác minh danh tính. Route Runner có guard/service key riêng. Trạng thái quyền từng thao tác mới phải có test 401/403 và ownership, không suy từ tag hoặc thiếu security annotation trong OpenAPI.
