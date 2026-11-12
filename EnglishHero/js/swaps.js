// 用字改變（例如 happy → glad / delighted）：設定
const { esc } = EH;
const toList = (it) => (Array.isArray(it.to) ? it.to : []);

EH.cardsPage({
  collection: "swaps",
  emoji: "🔄",
  pageTitle: "用字改變",
  itemLabel: "用字",
  emptyHint: "還沒有任何用字。\n按右上角「➕ 新增用字」，把「基本字 → 更好的說法」記下來，例如 happy → glad、delighted！",

  fields: [
    { key: "from", label: "原本的字（基本字）", type: "text", required: true, placeholder: "例：happy" },
    { key: "to", label: "可以換成（更好的用字）", type: "list", required: true, placeholder: "例：glad、delighted、thrilled", help: "可以寫很多個，用逗號或頓號分開" },
    { key: "note", label: "用法 / 差別（選填）", type: "text", placeholder: "例：delighted 的開心程度比 glad 更強" },
    { key: "example", label: "例句（選填）", type: "textarea", placeholder: "例：I'm delighted to meet you." }
  ],

  listMain: (it) => `<span class="word-en">${esc(it.from)}</span> <span class="muted">→</span> <b>${toList(it).map(esc).join("、")}</b>`,
  listSub: (it) => [it.note && esc(it.note), it.example && `<i>${esc(it.example)}</i>`].filter(Boolean).join("<br>"),

  q: (it) => esc(it.from),
  a: (it) => toList(it).map(esc).join("<br>"),
  extra: (it) => [it.note && esc(it.note), it.example && esc(it.example)].filter(Boolean).join("<br>"),

  speak: (it) => it.example || toList(it)[0] || it.from,
  searchText: (it) => [it.from, toList(it).join(" "), it.note, it.example].join(" ")
});
