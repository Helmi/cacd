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
			const stream = isError ? process.stderr : process.stdout;
			stream.write(`${JSON.stringify(output.data)}\n`);
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
