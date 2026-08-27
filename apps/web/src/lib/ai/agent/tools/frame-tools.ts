import { EditorCore } from "@/core";
import { analyzeImageWithVision } from "@/lib/ai/vision";
import { getLastFrameTime } from "@/lib/time";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { buildScene } from "@/services/renderer/scene-builder";
import type { TCanvasSize } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import type { AgentTool } from "./types";

const MAX_INSPECTION_DIMENSION = 1280;

export function resolveFrameInspection({
	time,
	trackId,
	tracks,
	duration,
	fps,
	canvasSize,
}: {
	time: number;
	trackId?: string;
	tracks: TimelineTrack[];
	duration: number;
	fps: number;
	canvasSize: TCanvasSize;
}) {
	if (
		!Number.isFinite(time) ||
		duration <= 0 ||
		time < 0 ||
		time > duration
	) {
		return {
			success: false as const,
			message: `Time must be between 0 and ${duration} seconds`,
		};
	}

	const selectedTrack = trackId
		? tracks.find((track) => track.id === trackId)
		: undefined;
	if (trackId && !selectedTrack) {
		return {
			success: false as const,
			message: `Track '${trackId}' not found`,
		};
	}
	if (selectedTrack?.type === "audio") {
		return {
			success: false as const,
			message: `Track '${trackId}' has no visual content`,
		};
	}

	const scale = Math.min(
		1,
		MAX_INSPECTION_DIMENSION / canvasSize.width,
		MAX_INSPECTION_DIMENSION / canvasSize.height,
	);

	return {
		success: true as const,
		tracks: selectedTrack ? [{ ...selectedTrack, hidden: false }] : tracks,
		renderTime: Math.min(time, getLastFrameTime({ duration, fps })),
		outputSize: {
			width: Math.max(1, Math.round(canvasSize.width * scale)),
			height: Math.max(1, Math.round(canvasSize.height * scale)),
		},
		scope: trackId ? ("track" as const) : ("project" as const),
		...(trackId ? { trackId } : {}),
	};
}

export const inspectFrameTool: AgentTool = {
	name: "inspect_frame",
	description:
		"Inspect the composed video frame at a timeline time, optionally isolating one visual track, and answer a visual question about it. The frame is sent to the configured vision model and is not saved.",
	parameters: {
		type: "object",
		properties: {
			time: {
				type: "number",
				description: "Timeline time in seconds.",
			},
			trackId: {
				type: "string",
				description:
					"Optional visual track ID. Omit to inspect the full composed frame.",
			},
			question: {
				type: "string",
				description:
					"Optional question to answer about the frame. Defaults to a general visual description.",
			},
		},
		required: ["time"],
	},
	async execute(args) {
		const editor = EditorCore.getInstance();
		const project = editor.project.getActiveOrNull();
		if (!project) {
			return { success: false, message: "No active project" };
		}

		const time = args.time as number;
		const trackId = args.trackId as string | undefined;
		const inspection = resolveFrameInspection({
			time,
			trackId,
			tracks: editor.timeline.getTracks(),
			duration: editor.timeline.getTotalDuration(),
			fps: project.settings.fps,
			canvasSize: project.settings.canvasSize,
		});
		if (!inspection.success) return inspection;

		try {
			const scene = buildScene({
				tracks: inspection.tracks,
				mediaAssets: editor.media.getAssets(),
				duration: editor.timeline.getTotalDuration(),
				canvasSize: project.settings.canvasSize,
				background: project.settings.background,
			});
			const renderer = new CanvasRenderer({
				...project.settings.canvasSize,
				fps: project.settings.fps,
			});
			const canvas = document.createElement("canvas");
			canvas.width = inspection.outputSize.width;
			canvas.height = inspection.outputSize.height;

			await renderer.renderToCanvas({
				node: scene,
				time: inspection.renderTime,
				targetCanvas: canvas,
			});
			const analysis = await analyzeImageWithVision({
				imageDataUrl: canvas.toDataURL("image/jpeg", 0.85),
				analysisPrompt:
					(args.question as string | undefined) ??
					"Describe the visible contents of this video frame, including composition, subjects, text, colors, and notable visual issues. State any uncertainty.",
			});
			if (!analysis.trim()) {
				throw new Error("Vision model returned an empty analysis");
			}

			return {
				success: true,
				message: `Frame inspected at ${time.toFixed(2)}s`,
				data: {
					time,
					renderedTime: inspection.renderTime,
					scope: inspection.scope,
					...(inspection.trackId
						? { trackId: inspection.trackId }
						: {}),
					width: inspection.outputSize.width,
					height: inspection.outputSize.height,
					analysis,
				},
			};
		} catch (error) {
			return {
				success: false,
				message:
					error instanceof Error
						? error.message
						: "Failed to inspect video frame",
			};
		}
	},
};

export const frameTools: AgentTool[] = [inspectFrameTool];
