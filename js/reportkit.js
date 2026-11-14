/* reportkit.js - one description of a report ("blocks"), shown two ways:
   Report.toHTML(blocks)  -> the page that is printed
   Report.toPDF(...)      -> a PDF file that is downloaded (made offline with the bundled pdf-lib)

   Block types:
     { t: "h", text }                              section heading
     { t: "rows", rows: [[label, value, style]] }  label/value lines. style: "b" (bold), "sub" (indented), "total"
     { t: "note", text }                           small italic note
     { t: "table", cols: [{ h, w, align }], rows: [[cell, ...]] }   w = share of the width, align: "l" | "r" | "c"
     { t: "sign" }                                 "Prepared by" / "Owner signature" lines
*/

const Report = {
  /* Shop details shown at the top of every page. */
  letterhead(title, period) {
    const s = Store.data.settings;
    const lines = [];
    if (s.address) lines.push(s.address);
    const contact = [s.phone ? "Phone: " + s.phone : "", s.ownerName ? "Owner: " + s.ownerName : ""].filter(Boolean).join("  |  ");
    if (contact) lines.push(contact);
    const by = Auth.user ? Auth.user.name : "";
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return {
      name: s.shopName, lines, title, period: period || "",
      meta: "Printed on " + fmtDate(todayISO()) + " at " + time + (by ? " by " + by : "")
    };
  },

  toHTML(blocks) {
    const sign = `<div class="signatures"><div>Prepared by</div><div>Owner signature</div></div>`;
    const table = (b, rows, withHead) => {
      const cls = c => (c.align === "r" ? "num" : c.align === "c" ? "sr" : "");
      const total = b.cols.reduce((s, c) => s + c.w, 0);
      return `<table class="rep-table rep-list"><colgroup>${b.cols.map(c =>
        `<col style="width:${(c.w / total * 100).toFixed(2)}%">`).join("")}</colgroup>${withHead ? `<thead><tr>${b.cols.map(c =>
        `<th class="${cls(c)}">${esc(c.h)}</th>`).join("")}</tr></thead>` : ""}<tbody>${rows.map(r =>
        `<tr>${r.map((cell, i) => `<td class="${cls(b.cols[i])}">${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    };
    return `<div class="report-sheet">${blocks.map((b, i) => {
      const next = blocks[i + 1];
      if (b.t === "h") return `<h4>${esc(b.text)}</h4>`;
      if (b.t === "note") return `<p class="rep-note">${esc(b.text)}</p>`;
      if (b.t === "sign") return i > 0 && blocks[i - 1].t === "table" ? "" : sign; // already added after the table
      if (b.t === "rows") {
        return `<table class="rep-table"><tbody>${b.rows.map(r =>
          `<tr class="${r[2] || ""}"><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td></tr>`).join("")}</tbody></table>`;
      }
      if (b.t === "table") {
        if (!next || next.t !== "sign") return table(b, b.rows, true);
        // The last rows stay on the same page as the signatures, so the signatures are never alone on a page.
        const keep = Math.min(3, b.rows.length);
        const head = b.rows.slice(0, b.rows.length - keep);
        const tail = b.rows.slice(b.rows.length - keep);
        return (head.length ? table(b, head, true) : "") +
          `<div class="keep-together">${table(b, tail, !head.length)}${sign}</div>`;
      }
      return "";
    }).join("")}</div>`;
  },

  /* Builds the PDF. Returns { bytes, replaced } - replaced is true when some characters
     (for example Urdu letters) could not be written because the PDF uses a standard English font. */
  async toPDF(blocks, head, footerLabel) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 40, BOTTOM = 62;
    const SIGN_H = 78; // room kept free at the bottom of every page for the signatures on the last page
    const black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35), lineGrey = rgb(0.78, 0.78, 0.78);
    let replaced = false;
    let page = null;
    let y = 0;

    const clean = s => {
      let out = "";
      for (const ch of String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ")) {
        const c = ch.charCodeAt(0);
        if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) out += ch;
        else { out += "?"; replaced = true; }
      }
      return out;
    };
    const width = (t, f, size) => f.widthOfTextAtSize(t, size);
    const text = (t, x, baseline, size, f, color) => page.drawText(t, { x, y: baseline, size, font: f || font, color: color || black });
    const centered = (t, size, f, color) => {
      text(t, (W - width(t, f, size)) / 2, y - size, size, f, color);
      y -= size + 3;
    };
    const hline = (yy, x1, x2, thickness, color) =>
      page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: thickness || 0.5, color: color || black });

    /* Cuts text into lines that fit the width. */
    const wrap = (t, f, size, maxW) => {
      const lines = [];
      let line = "";
      const push = word => {
        const test = line ? line + " " + word : word;
        if (width(test, f, size) <= maxW) { line = test; return; }
        if (line) { lines.push(line); line = ""; }
        if (width(word, f, size) <= maxW) { line = word; return; }
        for (const ch of word) { // very long word: break it
          if (width(line + ch, f, size) > maxW) { lines.push(line); line = ""; }
          line += ch;
        }
      };
      t.split(" ").forEach(push);
      lines.push(line);
      return lines;
    };

    const drawLetterhead = () => {
      centered(clean(head.name).toUpperCase(), 20, bold);
      head.lines.forEach(l => centered(clean(l), 10, font));
      y -= 6;
      centered(clean(head.title).toUpperCase(), 13, bold);
      if (head.period) centered(clean(head.period), 10.5, font);
      centered(clean(head.meta), 8, font, grey);
      y -= 4;
      hline(y, M, W - M, 1.5);
      y -= 12;
    };
    const newPage = () => {
      page = doc.addPage([W, H]);
      y = H - M;
      drawLetterhead();
    };
    /* Starts a new page when the next h points do not fit. Returns true if it did. */
    const ensure = h => {
      if (y - h >= BOTTOM + SIGN_H) return false;
      newPage();
      return true;
    };

    const drawTableHeader = (b, xs, ws) => {
      page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: rgb(0.93, 0.93, 0.93) });
      hline(y, M, W - M, 0.8);
      hline(y - 18, M, W - M, 0.8);
      b.cols.forEach((c, i) => alignedText(clean(c.h), xs[i], ws[i], c.align, y - 12.5, 9, bold));
      y -= 18;
    };
    const alignedText = (t, x, w, align, baseline, size, f) => {
      const tw = width(t, f, size);
      const px = align === "r" ? x + w - 4 - tw : align === "c" ? x + (w - tw) / 2 : x + 4;
      text(t, px, baseline, size, f);
    };

    newPage();
    for (const b of blocks) {
      if (b.t === "h") {
        ensure(60);
        y -= 12;
        text(clean(b.text).toUpperCase(), M, y - 10, 10.5, bold);
        y -= 15;
        hline(y, M, W - M, 0.8);
        y -= 4;
      } else if (b.t === "rows") {
        for (const r of b.rows) {
          const style = r[2] || "";
          const f = style === "b" || style === "total" ? bold : font;
          const size = style === "total" ? 11 : 10;
          ensure(22);
          if (style === "total") hline(y, M, W - M, 1);
          const baseline = y - 14;
          text(clean(r[0]), M + 6 + (style === "sub" ? 18 : 0), baseline, size, f);
          const v = clean(r[1]);
          text(v, W - M - 6 - width(v, f, size), baseline, size, f);
          y -= 19;
          hline(y, M, W - M, style === "total" ? 1.6 : 0.4, style === "total" ? black : lineGrey);
        }
      } else if (b.t === "note") {
        const lines = wrap(clean(b.text), font, 8.5, W - 2 * M);
        ensure(lines.length * 11 + 8);
        y -= 4;
        lines.forEach(l => { text(l, M, y - 8.5, 8.5, font, grey); y -= 11; });
      } else if (b.t === "table") {
        const total = b.cols.reduce((s, c) => s + c.w, 0);
        const ws = b.cols.map(c => (c.w / total) * (W - 2 * M));
        const xs = [];
        ws.reduce((x, w) => { xs.push(x); return x + w; }, M);
        ensure(18 + 24);
        drawTableHeader(b, xs, ws);
        for (const r of b.rows) {
          const cells = r.map((cell, i) => wrap(clean(cell), font, 9, ws[i] - 8));
          const h = Math.max(...cells.map(c => c.length)) * 11 + 7;
          if (ensure(h)) drawTableHeader(b, xs, ws); // header repeats on the new page
          cells.forEach((lines, i) => lines.forEach((l, k) =>
            alignedText(l, xs[i], ws[i], b.cols[i].align, y - 13 - k * 11, 9, font)));
          y -= h;
          hline(y, M, W - M, 0.4, lineGrey);
        }
        y -= 4;
      } else if (b.t === "sign") {
        // Fixed at the bottom of the last page, just above the page footer
        const base = BOTTOM + 26;
        const w = (W - 2 * M) * 0.4;
        hline(base, M, M + w, 0.8);
        hline(base, W - M - w, W - M, 0.8);
        text("Prepared by", M + (w - width("Prepared by", font, 10)) / 2, base - 13, 10, font);
        text("Owner signature", W - M - w + (w - width("Owner signature", font, 10)) / 2, base - 13, 10, font);
      }
    }

    // Footer on every page: "Shop - report, dates" on the left and "Page 1 of 3" on the right
    const pages = doc.getPages();
    const left = clean(footerLabel);
    pages.forEach((p, i) => {
      page = p;
      hline(44, M, W - M, 0.5, lineGrey);
      const label = wrap(left, font, 8, W - 2 * M - 80)[0];
      text(label, M, 32, 8, font, grey);
      const num = "Page " + (i + 1) + " of " + pages.length;
      text(num, W - M - width(num, font, 8), 32, 8, font, grey);
    });

    doc.setTitle(clean(head.title) + " - " + clean(head.name));
    doc.setCreator("Hardware Store Cash Book");
    return { bytes: await doc.save(), replaced };
  },

  /* Saves the file through the browser (works offline). */
  saveFile(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /* Shared by Reports and Cash Book: makes the PDF and saves it. */
  async download(blocks, title, ranged, range) {
    if (typeof PDFLib === "undefined") {
      UI.toast("The PDF tool is missing. Please use Print and choose Save as PDF.", "error");
      return;
    }
    try {
      const head = this.letterhead(title, ranged);
      const result = await this.toPDF(blocks, head, Store.data.settings.shopName + " - " + title + ": " + ranged);
      const part = s => String(s || "").replace(/[^A-Za-z0-9-]+/g, "");
      const name = part(title.replace(/ /g, "-")) + "_" + (range.from || "start") + "_to_" + (range.to || todayISO()) + ".pdf";
      this.saveFile(result.bytes, name);
      UI.toast("Report downloaded successfully.");
      if (result.replaced) {
        await UI.alert("Some characters (for example Urdu letters) cannot be shown in the PDF file and were replaced by ?. " +
          "To keep every letter, use the Print button and choose \"Save as PDF\".", "Note about the PDF");
      }
    } catch (err) {
      console.error(err);
      UI.toast("The report could not be made: " + err.message, "error");
    }
  }
};
