/** 跨 feature 共用的短暫操作提示；不包含任何業務規則。 */
let toastTimer = null;

export function showToast(message, type = 'success') {
  document.querySelector('.action-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `action-toast is-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  document.body.append(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2600);
}
