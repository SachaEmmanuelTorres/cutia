import { EXPORT_MIME_TYPES } from "@/constants/export-constants";
import type { ExportFormat } from "@/types/export";
import type { TimelineTrack } from "@/types/timeline";

export function getSelectedVideoClip({
	tracks,
	selection,
}: {
	tracks: TimelineTrack[];
	selection: { trackId: string; elementId: string };
}): { tracks: TimelineTrack[]; duration: number } | null {
	const track = tracks.find(({ id }) => id === selection.trackId);
	if (track?.type !== "video") return null;

	const element = track.elements.find(({ id }) => id === selection.elementId);
	if (element?.type !== "video") return null;

	return {
		duration: element.duration,
		tracks: [
			{
				...track,
				transitions: [],
				elements: [{ ...element, startTime: 0 }],
			},
		],
	};
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}
