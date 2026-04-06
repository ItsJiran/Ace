# Arsitektur Hybrid Planning & Continuous Prompt

Dokumen ini mendefinisikan arsitektur dan langkah implementasi untuk sistem **Hybrid Planning (Grand Plan & Short Plan)**. Sistem ini menjadikan *context planning* sebagai *single source of truth* untuk menentukan kapan AI harus melanjutkan eksekusi (continuous loop) dan kapan harus berhenti (yield ke user).

## Konsep Dasar

1. **Smart Context Mechanism:** AI memanipulasi rencana tugas melalui block handler (misalnya `<plan>` atau ekstensi dari `<context>`) **hanya di awal turn**. Mengingat eksekusi aksi (seperti `<tool>`) saat ini bersifat *interrupted* (memutus stream karena belum mendukung parallel tool calling), perencanaan taktis *wajib* dilakukan sebelum AI merender pemanggilan alat di turn tersebut.
2. **Non-interrupted Block:** Manipulasi planning bersifat silet/background (seperti `<context>`). Tidak memblokir output atau dirender secara invasif di chat stream, melainkan mengubah *state* internal.
3. **Grand Plan:** Rencana strategis jangka panjang (misalnya: "Buat project Vite, install Tailwind, setup routing").
4. **Short Plan / Takstis:** Langkah per-turn yang dinamis (misalnya: `"action": "read_file", "status": "pending"`). Menentukan *continuous loop*. Jika ada task taktis yang *pending*, `interactionLoop` akan otomatis men-trigger turn selanjutnya tanpa menunggu input user.

---

## Daftar Tugas Implementasi (Task List)

### Phase 1: Validasi Skema & Parser Engine
- [ ] **Define Schema Planning:** Buat Zod schema untuk payload planning di dalam `src/schemas/parser.ts`. Mencakup aksi CRUD: `create_plan`, `update_task_status`, `add_short_task`, dsb.
- [ ] **Buat Planning Block Handler:** Buat block handler baru (misal `PlanBlock.tsx` / `PlanBlock.ts`) di `src/core/packages/system/parsers/` atau ekstensikan fungsi `ContextBlock.ts` untuk memproses payload planning.
- [ ] **Event Bus Routing:** Daftarkan event route baru (misal `context:plan:update`) agar parser block dapat mengirim mutasi state ke engine.

### Phase 2: State Management (Planning Engine)
- [ ] **Buat Planning Service:** Buat service baru di `src/services/aiContext/planningService.ts` untuk mengolah operasi CRUD terhadap Grand Plan dan Short Plan.
- [ ] **Integrasi ke AIContextEngine:** Gabungkan *state* planning ke dalam `AIContextEngine` sehingga setiap kali turn baru dibuat, context builder dapat menyisipkan state planning terkini ke prompt AI.
- [ ] **Memory Persistence:** Tentukan mekanisme penyimpanan `plan_id` dan *state* ke ruang memori SQLite/lokal agar bertahan antar restart (jika diperlukan).

### Phase 3: Prompt Engineering & Protocol Text
- [ ] **Update System Prompt:** Modifikasi `src/services/aiContext/protocolTextService.ts` untuk mendeskripsikan cara kerja mekanisme Planning.
- [ ] **Berikan Rule "Yield":** Ajarkan AI kapan harus memberikan status `yield_to_user: true` (misal saat butuh konfirmasi user, error sulit, atau semua short plan selesai) vs `yield_to_user: false` (sedang rantai tool execution).
- [ ] **Suntikkan Current Plan:** Buat mekanisme di `contextBuilderService.ts` untuk merender/menyuntikkan state eksekusi Short Plan dan Grand Plan ke prompt pada setiap awal turn.

### Phase 4: Interaction Loop & Continuous Prompt
- [ ] **Akses State di Gateway:** Di dalam `src/services/aiGateway/interactionLoop.ts`, akses state Planning terbaru setelah blok parser/tool selesai.
- [ ] **Logika Continuous/Halt:** Modifikasi sistem loop. Jika `yield_to_user == false` dan ada plan `pending`, trigger fungsi otomatis seperti `buildActionContinuationPrompt()` (yang sebelumnya dimatikan) untuk melanjutkan chain. Jika `true` atau list short plan kosong, hentikan loop (`finalizeTurn`) dan tunggu user.
- [ ] **Timeout / Limitasi:** Tambahkan pengaman (misal max 5 auto-turns berturut-turut) untuk mencegah *infinite loop* jika AI gagal memperbarui status planning dengan konsisten.

### Phase 5: UI & UX (Renderers)
- [ ] **Buat Planning Renderer:** Buat UI component `PlanRenderer.tsx` (DevTools / Sidebar widget) yang melanggan (subscribe) ke event memory memory_uid planning engine.
- [ ] **Visualisasi Status:** Tampilkan checkpoint list dari Grand Plan dan Short Plan secara *realtime* (mirip tampilan task execution Devin/AutoGPT).
- [ ] **Integrasi ke Turn:** (Opsi) Tampilkan ringkasan kecil (badge) di atas Turn Renderer jika aksi dijalankan sebagai hasil dari internal planning otomatis.