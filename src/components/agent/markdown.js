function inline(source) {
  return source.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]).replace(/\*\*([^\n*]+)\*\*/g, '<strong>$1</strong>')
}

const listItem = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/
const tableDivider = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => inline(cell.trim()))

export function markdownHtml(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  const html = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6)
      html.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>')
      continue
    }
    if (line.includes('|') && tableDivider.test(lines[i + 1] || '')) {
      html.push('<div class="agent-md-table"><table><thead><tr><th>' +
        cells(line).join('</th><th>') + '</th></tr></thead><tbody>')
      i += 1
      while (lines[i + 1]?.includes('|')) {
        html.push('<tr><td>' + cells(lines[++i]).join('</td><td>') + '</td></tr>')
      }
      html.push('</tbody></table></div>')
      continue
    }
    const match = listItem.exec(line)
    if (match) {
      const tag = match[2] ? 'ol' : 'ul'
      html.push('<' + tag + '><li>' + inline(match[3]) + '</li>')
      let next
      while ((next = listItem.exec(lines[i + 1] || '')) && Boolean(next[2]) === Boolean(match[2])) {
        i += 1
        html.push('<li>' + inline(next[3]) + '</li>')
      }
      html.push('</' + tag + '>')
      continue
    }
    html.push('<p>' + inline(line) + '</p>')
  }
  return html.join('')
}
