import { addMonths, formatMonth } from '../lib/dates';

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
	return (
		<div className="month-picker">
			<button type="button" className="ghost" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
				‹
			</button>
			<strong>{formatMonth(month)}</strong>
			<button type="button" className="ghost" onClick={() => onChange(addMonths(month, 1))} aria-label="Next month">
				›
			</button>
		</div>
	);
}
