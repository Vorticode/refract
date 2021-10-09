import Refract from '../src/Refract.js';

export default class Spreadsheet extends Refract{

	rows = [[1, 2, 3, 4]];

	html = `
		<r-spreadsheet>
			<table id="table">
				${this.rows.map(row => // Rows
					`<tr>
						${row.map(col => // Columns
							`<td contenteditable value=${col}>${col}</td>`
						)}
					</tr>`
				)}
			</table>
		</r-spreadsheet>`;
}
eval(Spreadsheet.compile());
window.debug = true;