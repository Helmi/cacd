export interface FormattedOutput {
	text: string[];
	data: unknown;
}

export class OutputFormatter {
	constructor(private readonly json: boolean) {}

	isJsonEnabled(): boolean {
		return this.json;
	}

	write(output: FormattedOutput): void {
		this.render(output, false);
	}

	writeError(output: FormattedOutput): void {
		this.render(output, true);
	}

	private render(output: FormattedOutput, isError: boolean): void {
		if (this.json) {
			const serialized = JSON.stringify(output.data, null, 2);
			if (isError) {
				console.error(serialized);
			} else {
				console.log(serialized);
			}
			return;
		}

		for (const line of output.text) {
			if (isError) {
				console.error(line);
			} else {
				console.log(line);
			}
		}
	}
}
