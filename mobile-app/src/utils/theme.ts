export const C = {
  bg: '#0d1117',
  card: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#7d8590',
  green: '#3fb950',
  red: '#f85149',
  yellow: '#d29922',
  blue: '#58a6ff',
};

export const fmt = {
  currency: (v: number) =>
    `${v >= 0 ? '+' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  time: (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
};
