/** Khớp logic placeholder với server `renderMailTemplate` (xem trước mail). */
export type MailPreviewCtx = {
  surveyCode: string;
  name: string;
  email: string;
  greeting: string;
  title: string;
};

export function renderMailTemplate(template: string, ctx: MailPreviewCtx): string {
  const name = (ctx.name ?? "").trim();
  const greeting = (ctx.greeting ?? "").trim();
  const greetingOrName = greeting || name;
  const title = (ctx.title ?? "").trim();
  return template
    .replaceAll("{{greetingOrName}}", greetingOrName)
    .replaceAll("{{greeting}}", greeting)
    .replaceAll("{{code}}", ctx.surveyCode)
    .replaceAll("{{name}}", name)
    .replaceAll("{{email}}", ctx.email)
    .replaceAll("{{title}}", title);
}

/** Tách chuỗi để tô màu placeholder (dữ liệu từ danh sách). */
export function splitTemplateHighlights(text: string): { text: string; key: string }[] {
  const parts: { text: string; key: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = /\{\{[a-zA-Z]+\}\}/g;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ text: text.slice(last, m.index), key: "plain" });
    }
    parts.push({ text: m[0], key: "ph" });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), key: "plain" });
  if (!parts.length) parts.push({ text, key: "plain" });
  return parts;
}
