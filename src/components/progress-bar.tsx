import * as Progress from '@radix-ui/react-progress';


export default function ProgressBar({progress}: { progress: number }) {
    return (
        <div className="absolute w-full h-full bg-gray-800 z-50 top-0 left-0 flex items-center justify-center p-10">
            <Progress.Root className="relative h-2 w-full overflow-hidden rounded bg-gray-600" value={100}>
                <Progress.Indicator 
                    className="h-full w-full bg-blue-500 transition-transform duration-500" 
                    style={{ transform: `translateX(-${100 - progress}%)` }}
                />
            </Progress.Root>
        </div>
    );
}