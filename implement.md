# AI Body Defender - Implementation Plan

เอกสารนี้สรุปแผนพัฒนาเกมจาก `Overview.md` และสถานะโปรเจกต์ปัจจุบันใน `The-Game/` ซึ่งตอนนี้ยังเป็น Vite + React template เป็นหลัก เป้าหมายคือค่อย ๆ เปลี่ยนให้เป็นมินิเกมไร้สัมผัสบน browser ที่ใช้ webcam + MediaPipe Pose + Canvas game loop ตามแนวคิด Elite Hybrid Architecture

## Phase Status

- Phase 1: Done - สร้าง journey skeleton, 3-layer layout, mock vision loop, mock canvas game engine, HUD, result flow และ cleanup contract แล้ว
- Phase 2: Done - เชื่อม webcam จริง, MediaPipe PoseLandmarker, local WASM/model assets, wrist tracking, permission error และ mock fallback แล้ว
- Phase 3: Done - เพิ่ม core gameplay engine: 30s session, item taxonomy, spawn scheduler, difficulty ramp, object pool, collision scoring, health, combo, miss/avoid rules, hit effects และ HUD direct DOM cache
- Phase 4: Done - เพิ่ม HUD polish, health meter, floating feedback, low-health warning, hit/restore impact flash, result rating และ visual response ตอนเก็บ/พลาด item
- Phase 5: Done - เพิ่ม quality profile อัตโนมัติ, camera/vision FPS tuning, FPS telemetry, auto eco mode เมื่อ FPS ตก, pause/resume เมื่อ tab ถูกซ่อน และ cleanup class/timer ให้แน่นขึ้น
- Phase 6: In Progress - latency/noise hardening: เปลี่ยนเป็น HandLandmarker, เพิ่ม player-hand filter, prediction smoothing, vision telemetry, cached item sprites และเตรียม testing/release readiness

## Current Change Set

- เปลี่ยน Vision Layer เป็น MediaPipe `HandLandmarker` พร้อม local model asset `hand_landmarker.task` เพื่อลดภาระจาก gesture classifier
- เพิ่ม player-hand filter เพื่อลด noise จากมือที่เล็ก/ไกลเกินไป, มือที่โผล่ขอบจอ, คนเดินผ่าน และมือที่กระโดดออกจากตำแหน่งผู้เล่นเดิมเร็วผิดปกติ
- เพิ่ม confirmation frame, velocity prediction และ adaptive smoothing เพื่อให้มือไหลต่อเนื่องแม้ AI หลุดเฟรมสั้น ๆ
- เพิ่ม vision FPS เป็น 24/28/30 ตาม profile และใช้ `requestVideoFrameCallback` เมื่อ browser รองรับเพื่อลด latency สะสม
- เปลี่ยนการเริ่มเกมหลังกล้องพร้อมให้ใช้มือชนสัญลักษณ์ `พร้อม` ที่มุมขวาบน โดยไม่ต้องกดเมาส์และไม่ต้องกำมือ
- ปรับ game render loop ให้ลดการ resize canvas ทุกเฟรม, จำกัด pixel ratio, ลด shadow/effect ใน eco mode, เพิ่ม smoothing ที่ตอบสนองเร็วขึ้น และ cache item sprite เพื่อลดงานวาดซ้ำในทุกเฟรม
- เพิ่ม telemetry ใน HUD เป็น `R` render FPS, `V` vision FPS และ inference ms เพื่อจูน latency จากของจริงได้ง่ายขึ้น
- เปลี่ยน gameplay จากจับเวลาเป็นระบบเลือด: เกมจบเมื่อเลือดหมด
- เปลี่ยนไอเทมที่ตกลงมาเป็นสัญลักษณ์เกี่ยวกับยาเสพติดและสัญลักษณ์ป้องกัน เช่น `ยา`, `เข็ม`, `ผง`, `ขวด`, `โล่`, `+`, `★`
- สัญลักษณ์ร้ายลดเลือด และสัญลักษณ์ดีเพิ่มคะแนน
- คะแนนหลังจบเกมถูกแบ่งเป็นรางวัล 4 ระดับ
- ปรับ UI ทุกหน้ามาเป็นธีมขาว-ฟ้านีออน และจัด popup/HUD/ready target ให้สมส่วนขึ้น

## 1. วิเคราะห์จาก Overview

แกนของระบบมี 4 ส่วนหลัก:

1. Presentation Layer
   - HTML5 Video อยู่ชั้นหลังสุดสำหรับ webcam hologram background
   - Transparent Canvas อยู่ชั้นกลางสำหรับวัตถุในเกม เอฟเฟกต์ มือจำลอง และ collision feedback
   - React UI Overlay อยู่ชั้นหน้าสุดสำหรับเมนู สถานะ permission หน้านับถอยหลัง HUD และหน้าสรุปผล

2. AI Vision Layer
   - แยก loop ตรวจจับท่าทางออกจาก React render
   - ใช้ MediaPipe Pose / WASM / WebGL backend
   - ดึงเฉพาะพิกัดข้อมือซ้ายและขวา
   - ส่งข้อมูลเข้า `useRef` หรือ mutable store เพื่อให้ game loop อ่านได้โดยไม่ trigger React re-render

3. Game Engine Layer
   - ใช้ `requestAnimationFrame()` สำหรับ render 60 FPS
   - ใช้ delta time คุม movement ให้เสถียร
   - ใช้ Lerp ทำให้ตำแหน่งมือจาก AI 30 FPS เคลื่อนเนียนที่ 60 FPS
   - ใช้ Object Pool สำหรับ item ที่ตกลงมา ลด garbage collection
   - ตรวจ collision ด้วย Euclidean distance

4. Lifecycle / Performance Layer
   - เริ่มกล้องและ AI เฉพาะตอนเข้าเล่น
   - หยุด loop, ปิด camera tracks, และ dispose resource เมื่อจบเกมหรือออกจากหน้า
   - React state ใช้เฉพาะ state ระดับหน้าจอ ไม่ใช้กับตำแหน่งมือหรือวัตถุที่อัปเดตทุก frame
   - HUD ที่เปลี่ยนเร็ว เช่น score/time สามารถอัปเดตผ่าน ref หรือ direct DOM อย่างระวัง

## 2. สถานะโปรเจกต์ปัจจุบัน

โครงสร้างที่มีอยู่ตอนนี้:

```text
The-Game/
  src/
    App.tsx
    App.css
    index.css
    main.tsx
    assets/
      hero.png
      react.svg
      vite.svg
  public/
    icons.svg
    favicon.svg
  package.json
  vite.config.ts
```

ข้อสังเกต:

- `App.tsx` ยังเป็นหน้า starter ของ Vite/React
- ยังไม่มี module สำหรับ webcam, vision, game engine, object pool, collision, หรือ game state
- dependency ยังไม่มี MediaPipe หรือ library ที่เกี่ยวกับ vision
- ยังไม่มีหน้าจอ journey ของผู้เล่น เช่น permission, calibration, countdown, playing, result

## 3. โครงสร้างปลายทางที่ควรเห็นตั้งแต่เฟสแรก

เฟสแรกต้องทำให้ทีมเห็นภาพ journey ทั้งหมดก่อน แม้ logic ลึก ๆ ยังเป็น stub ได้ โดยวางโครงสร้างไฟล์และ flow ให้ชัดเจนดังนี้:

```text
The-Game/src/
  App.tsx
  App.css
  index.css

  app/
    GameShell.tsx
    gameFlow.ts
    types.ts

  components/
    CameraLayer.tsx
    CanvasLayer.tsx
    HudOverlay.tsx
    PermissionScreen.tsx
    CalibrationScreen.tsx
    CountdownScreen.tsx
    ResultScreen.tsx

  game/
    GameEngine.ts
    ObjectPool.ts
    collision.ts
    items.ts
    math.ts
    renderer.ts
    types.ts

  vision/
    VisionHandler.ts
    camera.ts
    poseTypes.ts

  state/
    refs.ts
    scoreDom.ts

  assets/
    hero.png
```

## 4. Player Journey ที่ต้องเห็นครบในเฟสแรก

ลำดับหน้าจอที่ผู้เล่นควรเจอ:

```text
Start
  -> Permission Request
  -> Camera Ready
  -> Body / Wrist Calibration
  -> Countdown
  -> Playing
  -> Result
  -> Play Again / Exit
```

รายละเอียดแต่ละช่วง:

1. Start
   - แสดงชื่อเกมและปุ่มเริ่ม
   - ยังไม่เปิดกล้องจนกว่าผู้เล่นกดเริ่ม

2. Permission Request
   - ขอสิทธิ์ webcam
   - แสดงสถานะ loading, denied, unavailable

3. Camera Ready
   - แสดง video layer เป็นพื้นหลัง
   - ตรวจว่า stream พร้อมก่อนเข้าหน้า calibration

4. Body / Wrist Calibration
   - แสดงกรอบหรือ marker บอกตำแหน่งมือซ้าย/ขวา
   - ถ้ายังไม่เจอข้อมือ ให้ค้างอยู่หน้านี้
   - ในเฟสแรกสามารถใช้ mock wrist data ได้ก่อน

5. Countdown
   - นับ 3, 2, 1
   - เตรียม engine, pool และ timer

6. Playing
   - Canvas render items และ hand cursors
   - HUD แสดง score, time, combo หรือ health ตาม design
   - React ไม่ re-render ตามตำแหน่งมือ

7. Result
   - หยุด engine และ vision loop
   - ปิด webcam stream ถ้าออกจาก game session
   - แสดงคะแนนรวมและ action เล่นใหม่

## 5. Technical Journey ที่ต้องเห็นครบในเฟสแรก

ลำดับการทำงานของระบบ:

```text
React GameShell
  -> request camera stream
  -> attach stream to video element
  -> start VisionHandler async loop
  -> write wrist positions to refs
  -> start GameEngine RAF loop
  -> GameEngine reads refs every frame
  -> render to transparent canvas
  -> collision updates score/time refs or DOM
  -> end condition calls onGameOver(score)
  -> React moves to ResultScreen
  -> cleanup engine, vision, and camera
```

## 6. Implementation Phases

### Phase 1 - Journey Skeleton and Architecture Map

เป้าหมาย: เห็นโครงสร้าง journey ทั้งหมดก่อน โดยยังไม่ต้องมี AI จริงครบทุกส่วน

งานที่ต้องทำ:

- ล้างหน้า Vite starter ออกจาก `App.tsx`
- สร้าง `GameShell` เป็นตัวคุม state ของ flow ทั้งหมด
- สร้างหน้าจอ Start, Permission, Calibration, Countdown, Playing, Result
- สร้าง layout 3 layer: video, canvas, React overlay
- สร้าง mock `VisionHandler` ที่ปล่อย wrist position จำลองได้
- สร้าง mock `GameEngine` ที่วาดมือและ item ง่าย ๆ บน canvas
- สร้าง type กลาง เช่น `GamePhase`, `WristPoint`, `GameResult`
- วาง cleanup contract ให้ชัด: `start()`, `stop()`, `dispose()`
- ทำให้กดเล่นจนครบ journey ได้ตั้งแต่ต้นจนจบ

Definition of Done:

- เปิดแอปแล้วเห็น flow ครบ Start -> Permission -> Calibration -> Countdown -> Playing -> Result
- มี video/canvas/ui layer ซ้อนกันตามสถาปัตยกรรม
- มีไฟล์และ module ตามโครงสร้างปลายทางหลัก
- ยังไม่ต้องใช้ MediaPipe จริง แต่ interface ต้องรองรับการแทนที่ในเฟสถัดไป

### Phase 2 - Camera and Real Vision Integration

เป้าหมาย: เชื่อม webcam และ MediaPipe Pose จริง

งานที่ต้องทำ:

- เพิ่ม dependency สำหรับ MediaPipe Pose หรือ Tasks Vision
- สร้าง `camera.ts` สำหรับ `getUserMedia`, attach video, stop tracks
- ทำ `VisionHandler` แบบ async loop
- เปิด WASM / WebGL backend ตาม library ที่เลือก
- อ่าน left/right wrist แล้ว normalize เป็น canvas coordinate
- เพิ่มสถานะ confidence และ lost tracking
- Calibration ใช้ข้อมูล wrist จริง
- fallback เป็น mock mode สำหรับ dev/testing

Definition of Done:

- กล้องทำงานบน Chrome
- ตรวจจับข้อมือซ้าย/ขวาได้
- ตำแหน่งมือบน canvas ตามมือจริงโดยไม่ทำให้ React re-render ทุก frame
- ปิดกล้องได้สมบูรณ์เมื่อจบ session

### Phase 3 - Core Game Engine

เป้าหมาย: สร้าง gameplay หลักให้เล่นได้จริงและลื่น

งานที่ต้องทำ:

- ทำ `GameEngine` ด้วย `requestAnimationFrame`
- ใช้ delta time สำหรับ movement และ timer
- ทำ Lerp ระหว่าง wrist target กับ hand cursor
- สร้าง Object Pool สำหรับ items
- กำหนด item types เช่น harmful / healthy / bonus
- สร้าง spawn scheduler
- ทำ collision detection ด้วย distance
- อัปเดต score/time ผ่าน ref หรือ direct DOM เฉพาะจุดที่จำเป็น
- ส่ง `onGameOver(result)` กลับ React เมื่อหมดเวลา

Definition of Done:

- Gameplay เล่นได้ครบหนึ่งรอบ
- Item ถูก reuse จาก pool
- Collision และ scoring ถูกต้อง
- Canvas render ลื่นและไม่มี allocation หนักใน loop

### Phase 4 - UI, Feedback, and Game Feel

เป้าหมาย: ทำให้เกมรู้สึกสมบูรณ์และเข้าใจง่าย

งานที่ต้องทำ:

- ออกแบบ HUD สำหรับ score, timer, tracking status
- เพิ่ม visual feedback ตอนเก็บ item
- เพิ่ม hit effect, miss effect, combo feedback
- เพิ่มเสียงหรือ vibration-like visual cue ถ้าเหมาะ
- ปรับ responsive layout สำหรับ laptop และจอขนาดต่าง ๆ
- ปรับธีมภาพให้เข้ากับ AI Body Defender ไม่เหลือกลิ่น template

Definition of Done:

- ผู้เล่นเข้าใจว่าต้องทำอะไรโดยไม่ต้องอ่านข้อความยาว
- UI ไม่บังมือหรือ item สำคัญ
- ภาพรวมดูเป็นเกมจริง ไม่ใช่ prototype เปล่า

### Phase 5 - Performance Hardening

เป้าหมาย: คุม latency, FPS, memory และ cleanup

งานที่ต้องทำ:

- ตรวจ frame time และ FPS เบื้องต้น
- ลด allocation ใน RAF loop
- ตรวจว่า React ไม่ re-render ระหว่าง playing โดยไม่จำเป็น
- ตรวจ memory leak จาก camera stream, animation frame, MediaPipe instance
- เพิ่ม visibility handling: pause/resume เมื่อ tab ถูกซ่อน
- เพิ่ม quality settings ถ้าเครื่องช้า เช่น ลด vision FPS หรือ item count

Definition of Done:

- เล่นบน laptop ทั่วไปได้ใกล้ 60 FPS
- Vision loop ประมาณ 30 FPS หรือตามค่าที่กำหนด
- ออกจากเกมแล้ว webcam ถูกปิดจริง
- เล่นซ้ำหลายรอบแล้ว performance ไม่ตกชัดเจน

### Phase 6 - Testing and Release Readiness

เป้าหมาย: เตรียมให้ส่งมอบหรือ deploy ได้มั่นใจ

งานที่ต้องทำ:

- เพิ่ม unit test สำหรับ math, collision, object pool
- เพิ่ม manual QA checklist สำหรับ webcam permission และ Chrome
- ทดสอบ build ด้วย `npm run build`
- ทดสอบ lint ด้วย `npm run lint`
- อัปเดต README ให้เป็นของโปรเจกต์เกม
- ระบุ browser support และข้อจำกัดของ webcam

Definition of Done:

- build ผ่าน
- lint ผ่านหรือมีรายการที่ตั้งใจยกเว้น
- README อธิบายการ run, gameplay, และ architecture
- มี checklist สำหรับทดสอบก่อน demo

## 7. ลำดับ implement ที่แนะนำ

1. สร้าง Phase 1 ให้ครบ journey ก่อน
2. ใส่ mock vision และ mock engine เพื่อให้ flow ทดสอบได้เร็ว
3. แทน mock camera ด้วย webcam จริง
4. แทน mock wrist data ด้วย MediaPipe wrist detection
5. ขยาย engine เป็น gameplay จริง
6. เติม game feel และ polish
7. optimize performance และ cleanup
8. เพิ่ม test, README, และ build verification

## 8. Risk / Decision ที่ต้องล็อกก่อนลงลึก

- เลือก MediaPipe package ที่จะใช้: Pose legacy หรือ Tasks Vision
- กำหนด coordinate system กลาง: normalized 0..1 หรือ canvas pixel
- ตัดสินใจว่า score/time HUD จะใช้ direct DOM หรือ ref + scheduled UI update
- กำหนด item taxonomy และ scoring rule
- กำหนดความยาวหนึ่งรอบเกม เช่น 30, 45 หรือ 60 วินาที
- กำหนดว่าจะปิดกล้องทุกครั้งหลังจบเกม หรือคง stream ไว้ถ้าผู้เล่นกดเล่นซ้ำทันที

## 9. Next Step ที่ควรเริ่มทันที

เริ่มจาก Phase 1 โดยแก้ `App.tsx` ให้เรียก `GameShell` และสร้างไฟล์ skeleton ทั้งหมดตามโครงสร้างปลายทาง จากนั้นทำ mock journey ให้กดเล่นได้ครบหนึ่งรอบ แม้ AI และ gameplay จริงยังเป็น placeholder อยู่ก็ตาม จุดนี้จะทำให้เห็นทั้ง player journey และ technical journey ตั้งแต่ต้นจนจบ ก่อนค่อยเติมระบบจริงทีละชั้น
