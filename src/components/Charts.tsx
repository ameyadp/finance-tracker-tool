import { formatMonth } from '../lib/dates';

// Small dependency-free SVG charts. They scale to their container width.

const W = 600;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 8 };

interface BarDatum {
	month: string;
	incomeCents: number;
	spendingCents: number;
}

export function IncomeSpendingChart({ data, format }: { data: BarDatum[]; format: (c: number) => string }) {
	const max = Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.spendingCents]));
	const plotH = H - PAD.top - PAD.bottom;
	const slot = (W - PAD.left - PAD.right) / Math.max(1, data.length);
	const barW = Math.min(28, slot / 3);

	return (
		<figure className="chart">
			<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Income and spending by month">
				<line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="axis" />
				{data.map((d, i) => {
					const cx = PAD.left + slot * i + slot / 2;
					const incomeH = (d.incomeCents / max) * plotH;
					const spendH = (d.spendingCents / max) * plotH;
					return (
						<g key={d.month}>
							<rect
								x={cx - barW - 1}
								y={H - PAD.bottom - incomeH}
								width={barW}
								height={incomeH}
								rx={3}
								className="bar-income"
							>
								<title>{`${formatMonth(d.month)} income: ${format(d.incomeCents)}`}</title>
							</rect>
							<rect
								x={cx + 1}
								y={H - PAD.bottom - spendH}
								width={barW}
								height={spendH}
								rx={3}
								className="bar-spending"
							>
								<title>{`${formatMonth(d.month)} spending: ${format(d.spendingCents)}`}</title>
							</rect>
							<text x={cx} y={H - 8} textAnchor="middle" className="tick">
								{formatMonth(d.month, 'short')}
							</text>
						</g>
					);
				})}
			</svg>
			<figcaption className="legend">
				<span className="swatch income" /> Income <span className="swatch spending" /> Spending
			</figcaption>
		</figure>
	);
}

interface LineDatum {
	month: string;
	netCents: number;
}

export function NetWorthChart({ data, format }: { data: LineDatum[]; format: (c: number) => string }) {
	if (data.length === 0) return null;
	const values = data.map((d) => d.netCents);
	const min = Math.min(0, ...values);
	const max = Math.max(0, ...values);
	const span = max - min || 1;
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;
	const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
	const y = (v: number) => PAD.top + plotH - ((v - min) / span) * plotH;

	const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.netCents)}`).join(' ');
	const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
	const labelEvery = Math.ceil(data.length / 6);

	return (
		<figure className="chart">
			<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net worth over time">
				<path d={area} className="area" />
				<line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="axis" />
				<path d={line} className="line" />
				{data.map((d, i) => (
					<g key={d.month}>
						<circle cx={x(i)} cy={y(d.netCents)} r={4} className="dot">
							<title>{`${formatMonth(d.month)}: ${format(d.netCents)}`}</title>
						</circle>
						{(i % labelEvery === 0 || i === data.length - 1) && (
							<text x={x(i)} y={H - 8} textAnchor="middle" className="tick">
								{formatMonth(d.month, 'short')}
							</text>
						)}
					</g>
				))}
			</svg>
		</figure>
	);
}
