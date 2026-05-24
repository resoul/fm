import { FIELD } from './config'

type CreatePitchLayoutOptions = {
    viewportWidth: number
}

export function createPitchLayout({ viewportWidth }: CreatePitchLayoutOptions) {
    const scale = viewportWidth / FIELD.width
    const width = FIELD.width * scale
    const height = FIELD.height * scale

    const metersToPx = (meters: number) => meters * scale
    const pxToMeters = (px: number) => px / scale
    const centerCircleRadius = metersToPx(FIELD.centerCircleRadius)
    const penaltyArea = metersToPx(FIELD.penaltyArea.width)
    const penaltyAreaDepth = metersToPx(FIELD.penaltyArea.depth)
    const goalArea = metersToPx(FIELD.goalArea.width)
    const goalAreaDepth = metersToPx(FIELD.goalArea.depth)
    const penaltySpotDistance = metersToPx(FIELD.penaltySpotDistance)
    const goal = metersToPx(FIELD.goal.width)
    const cornerRadius = metersToPx(FIELD.cornerRadius)
    const cols = (cellSize: number) => Math.floor(FIELD.width / cellSize)
    const rows = (cellSize: number) => Math.floor(FIELD.height / cellSize)

    const worldToScreen = (x: number, y: number) => {
        return {
            x: metersToPx(x),
            y: metersToPx(y),
        }
    }

    const screenToWorld = (x: number, y: number) => {
        return {
            x: pxToMeters(x),
            y: pxToMeters(y),
        }
    }

    return {
        scale,
        width,
        height,
        centerCircleRadius,
        penaltyArea,
        penaltyAreaDepth,
        goalAreaDepth,
        goalArea,
        penaltySpotDistance,
        goal,
        cornerRadius,
        cols,
        rows,
        metersToPx,
        pxToMeters,
        worldToScreen,
        screenToWorld,
    }
}