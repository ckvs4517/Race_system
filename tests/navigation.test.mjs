/** 公開／管理模式導覽與登出入口的顯示測試。 */
import { shell } from '../src/ui/shell.js';
import { controlView } from '../src/views/control.js';

const adminShell = shell('control', '', { isAdmin: true });
assert(adminShell.includes('data-route="control">管理後台'), '登入後頂端導覽顯示管理後台');
assert(adminShell.includes('data-action="logout-admin">登出'), '登入後頂端固定顯示登出按鈕');
assert(!controlView(true).includes('data-action="logout-admin"'), '後台內容不再重複顯示登出按鈕');

const publicShell = shell('home', '', { isAdmin: false });
assert(publicShell.includes('data-route="control">主辦方登入'), '公開模式顯示主辦方登入');
assert(!publicShell.includes('data-action="logout-admin"'), '公開模式不顯示登出按鈕');
assert(publicShell.includes('href="https://github.com/ckvs4517/Race_system"'), '頁尾可前往 GitHub 專案');
assert(publicShell.includes('target="_blank" rel="noopener noreferrer"'), 'GitHub 外部連結安全地開啟新分頁');

console.log('PASS 7 navigation tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}
