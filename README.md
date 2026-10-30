# taiwan-market-history
台股十年歷史資料與策略驗證研究：含成本、除權息、樣本外檢驗及基準比較；不含私人持股，不保證未來報酬。

## 資料

- `data/twse/YYYY/YYYYMMDD.csv.gz`：證交所「每日收盤行情」（MI_INDEX，全部證券，不含權證）。
- `data/tpex/YYYY/YYYYMMDD.csv.gz`：櫃買中心「上櫃股票每日收盤行情」。
- 欄位：`code,name,open,high,low,close,volume,value,trades,change,flag,next_ref`（`next_ref` 只有櫃買有：次日參考價）。
- `data/twse-exright/YYYY/YYYY-MM.csv.gz`：證交所除權除息計算結果（TWT49U），欄位 `date,code,prev_close,ref_price,value,type`。除權息日交易所標「不比價」，含息報酬改用這裡的官方參考價。
- 價格為**未還原原始價**；`change` 是官方漲跌（相對當日參考價），`flag=X` 表示除權息等不比價日。由 `close - change` 可回推官方參考價，用來計算含息報酬。
- 只保存股票（4 碼）與 ETF（00 開頭），不存權證、債券、特別股與 ETN。
- 按「日期」抓全市場，所以已下市的股票也在當天檔案裡（避免只看存活者）。
- `data/progress.json` 記錄每天每個市場的狀態（`ok:筆數`／`closed` 休市／`failed`），`data/status.json` 是最近一次執行摘要。

## 下載方式

GitHub Actions 每小時抓一批（證交所與櫃買兩個來源同時抓、各自每次間隔 4 秒，每個來源每批最多 750 個請求，最多跑 50 分鐘就先存檔），由新到舊、可中斷續跑。也可在 Actions 頁面手動執行。

來源：臺灣證券交易所、證券櫃檯買賣中心公開資訊。資料可能有官方修正或缺漏，使用前請自行核對。
