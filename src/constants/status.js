// 週報狀態選項（主要狀態系統）
export const REPORT_STATUSES = ['正在進行', '已上線', '下週繼續', '封存'];

// 週報狀態數字對應：0-3 對應週報狀態文字
export const REPORT_STATUS_NUMBER_MAP = {
  '0': '正在進行',
  '1': '已上線',
  '2': '下週繼續',
  '3': '封存'
};

// 將狀態輸入（數字或文字）轉換為週報狀態文字
export function parseStatusInput(input, statusMap = REPORT_STATUS_NUMBER_MAP) {
  // 檢查輸入是否為數字 (0-3)
  if (/^[0-3]$/.test(input.trim())) {
    return statusMap[input.trim()];
  }
  // 否則，直接返回輸入（應該是狀態文字）
  return input;
}

