export default function Navbar() {
  return (
    <nav className="flex items-center h-11 px-4 bg-[#1c1c1e] border-b border-[#2a2a2d] flex-shrink-0 z-20">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none">
          <polygon
            points="16,3 29,27 3,27"
            stroke="#f5c518"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <polygon points="16,13 23,27 9,27" fill="#f5c518" opacity="0.85" />
        </svg>
        <span className="font-semibold text-[15px] text-white">ImageTo3D</span>
        <span className="text-[10px] text-[#555558] bg-[#252527] px-1.5 py-0.5 rounded font-medium ml-0.5">
          DEMO
        </span>
      </div>

      <div className="ml-auto text-[12px] text-[#3a3a3e]">
        Upload an image → Generate → View 3D Model
      </div>
    </nav>
  )
}
