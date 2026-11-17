# MOMO · WebAR AI 小夥伴

可愛的原創 3D 兔形角色，能站在地面、跳舞、哼歌，並使用真正的本機語言模型與使用者聊天。

## 使用方式

1. 開啟網站，按「啟用 AI 對話」。
2. 首次需下載約 400 MB 模型，建議使用 Wi-Fi，並保持頁面開啟；後續可使用瀏覽器快取。
3. 輸入想說的話，或允許麥克風後使用語音。AI 回覆會逐字顯示，再由裝置語音朗讀。
4. 使用相容 Android Chrome，按「放到我的空間」，掃描地面並點「放在這裡」。
5. 單指旋轉、雙指縮放，或使用旋轉按鈕與 25%–300% 大小滑桿。

## 自然語言對話

使用 Transformers.js 4.3.2 與 Qwen3-0.6B-ONNX-OPT 的量化模型，固定模型版本。模型在 WebWorker 執行，自動選擇 WebGPU 或 CPU/WASM，支援串流、停止回覆與最近幾輪的對話脈絡。使用 OpenCC 轉成繁體中文。

這是本機生成式 AI，沒有罐頭聊天降級，不需 OpenAI API 金鑰。模型與字典從 Hugging Face、jsDelivr 下載；對話文字在本機產生，不送到雲端 AI。瀏覽器語音辨識可能使用瀏覽器的線上辨識服務。

小型模型可能答錯、混淆語意，沒有即時網路資料，能力不等同大型雲端模型。首次下載、載入與回覆速度依裝置和網路而定；模型快取可能被瀏覽器清除。GPU 模型約 355 MB，CPU 模型約 403 MB，另有詞表與執行引擎；GPU 初始化失敗改用 CPU 時可能額外下載另一份模型。

## 3D 與聲音

- 原創 19 骨骼 SkinnedMesh，待機、揮手、跳舞、哼歌、開心動作。
- 名字、五種顏色、嫩芽／花朵配件、隨機外觀組合。
- 旋轉、縮放、骨架顯示與預覽拍照。
- 真正 WebXR hit-test 地面定位，未支援的裝置提供 3D 預覽。
- 無 WebGL 時，使用 CPU 投影相同的 3D 模型。
- 語音朗讀、眨眼、嘴型，與 16 秒原創合成旋律哼唱；哼唱並非真人歌聲。

## 部署

專案為靜態網站，GitHub Pages 使用 `main` 分支的根目錄。根目錄 `index.html` 會導向 `dist/`，不需要編譯或後端。

本機測試：`python3 -m http.server 8080`，開啟 `http://localhost:8080/dist/`。手機 AR 需要 HTTPS、支援 ARCore 的裝置與 WebXR immersive-ar／hit-test／DOM overlay。

## 驗證

已完成模組語法檢查、骨架動畫變形、手勢事件、對話取消與歷史上限測試。相同模型與推論參數的 Node CPU 測試通過三輪中文對話，包含前文姓名與情境延續，以及串流中止。這些執行環境的速度不代表手機速度；手機 AR 與語音需實機測試。

## 第三方項目

- Three.js 0.180.0：MIT，授權見 `dist/vendor/THREE-LICENSE.txt`。
- Transformers.js：https://github.com/huggingface/transformers.js
- Qwen3 模型：https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX-OPT
- OpenCC：https://github.com/nk2028/opencc-js

外觀儲存在 localStorage，對話只保留於目前頁面記憶體。專案不包含任何 API 金鑰、站台憑證或使用者私人資料。
