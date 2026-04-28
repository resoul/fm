import Day from "./day";

export default function Days() {
    return (
        <div className="flex fixed z-51 border-b border-gray-300 w-full  gap-5">
            {Array.from({ length: 17 }, (_, i) => (
                <Day key={i} dayNumber={i} />
            ))}
        </div>
    );
}