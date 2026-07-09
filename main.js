document.addEventListener('DOMContentLoaded', () => {
  loadCsvAndBuildHtml('hints.csv');
});

async function loadCsvAndBuildHtml(csvPath) {
  const container = document.getElementById('accordion-container');
  try {
    const response = await fetch(csvPath);
    if (!response.ok) throw new Error('CSV読込エラー');
    let csvText = await response.text();

    // BOM(0xFEFF)があれば削除（Excel保存対策）
    if (csvText.charCodeAt(0) === 0xFEFF) {
      csvText = csvText.slice(1);
    }

    const tree = buildTreeFromCsvText(csvText);
    container.innerHTML = buildHtmlRecursive(tree);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p style="color: red;">エラー: ${error.message}</p>`;
  }
}

// RFC4180準拠のCSVパーサー。
// ダブルクォートで囲まれたセル内に「本物の改行(\n / \r\n)」や「カンマ」が
// 含まれていても正しく1つのフィールドとして読み取る。
// (旧実装は先にcsvText.split('\n')で行分割していたため、セル内に
//  スプレッドシートで入力した改行が入っていると、そこでレコードが
//  真っ二つに割れてしまい、後半の文章がまるごと消える不具合があった)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\r') {
        if (next === '\n') {
          // \r\n の \r 側はスキップし、改行処理は次の \n 側に任せる
        } else {
          row.push(field);
          field = '';
          rows.push(row);
          row = [];
        }
      } else if (char === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  // 末尾に改行が無い場合の最終フィールド/行を回収
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// セル内の本物の改行(\n)を<br>に変換する。
// (すでに文中に手入力された<br>タグはそのままHTMLとして機能するので触らない)
function formatContent(text) {
  return text.replace(/\r\n|\r|\n/g, '<br>');
}

function buildTreeFromCsvText(csvText) {
  const tree = {};
  const allRows = parseCsv(csvText);
  allRows.shift(); // ヘッダー削除

  allRows.forEach(row => {
    if (row.length === 0 || row.every(f => f.trim() === '')) return;

    let currentLevel = tree;
    const content = row[row.length - 1];
    const levels = row.slice(0, -1);
    let lastValidLevelIndex = -1;
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i]) { lastValidLevelIndex = i; break; }
    }
    for (let i = 0; i < levels.length; i++) {
      const levelName = levels[i];
      if (!levelName) continue;
      if (i === lastValidLevelIndex) {
        currentLevel[levelName] = content; break;
      } else {
        if (!currentLevel[levelName]) currentLevel[levelName] = {};
        currentLevel = currentLevel[levelName];
      }
    }
  });
  return tree;
}

function buildHtmlRecursive(treeNode) {
  if (typeof treeNode === 'object' && treeNode !== null) {
    let html = '<ul class="accordion-list">\n';
    for (const key in treeNode) {
      // 見出しにもHTMLタグを使用可能にするためそのまま出力
      html += `<li><details><summary>${key}</summary>${buildHtmlRecursive(treeNode[key])}</details></li>\n`;
    }
    html += '</ul>\n';
    return html;
  } else if (typeof treeNode === 'string') {
    return `<div class="hint-content">\n  ${formatContent(treeNode)}\n</div>\n`;
  }
  return '';
}
