/** Formateo en es-ES, igual que en el diseño (coma decimal, punto de millares). */

export const formatPoints = (n: number) => n.toLocaleString('es-ES')

export const formatSeconds = (n: number) =>
  n > 0 ? `${n.toFixed(1).replace('.', ',')} s` : '—'

export const formatPercent = (n: number) => `${n} %`

export const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
