import MessageParser from '../messageParser.js';

// 驗證任務單號格式
export function validateTicketId(ticketId) {
  return MessageParser.extractTicketId(ticketId) !== null;
}

// 驗證進度值
export function validateProgress(progress) {
  const num = parseInt(progress);
  return !isNaN(num) && num >= 0 && num <= 100;
}

// 驗證狀態值
export function validateStatus(status, validStatuses) {
  return validStatuses.includes(status);
}

