export default function Header() {

    return (
        <div className="w-full h-16 bg-gray-800 flex items-center">
            <div className="text-yellow-400 text-xl font-bold min-w-60 px-20">2 Days</div>
            <div className="w-0.5 bg-gray-600 h-full mr-5 "></div>
            <div className="text-white justify-center">
                Next match: Juventus vs Inter
            </div>
        </div>
    );
}