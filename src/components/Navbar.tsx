export default function Navbar() {
  return (
    <nav className="flex items-center h-12 px-5 bg-[#101826] border-b border-[#263348] flex-shrink-0 z-20">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7c89ff] text-white shadow-[0_10px_26px_rgba(124,137,255,0.25)]">
          <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none">
            <path d="M16 4 27 10.5v11L16 28 5 21.5v-11L16 4Z" stroke="currentColor" strokeWidth="2" />
            <path d="M16 4v24M5 10.5l11 6.5 11-6.5" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <span className="font-bold text-[15px] text-white">ImageTo3D</span>
        <span className="text-[10px] text-[#aab7cc] bg-[#1a2537] px-2 py-1 rounded-full font-semibold ml-0.5">
          PIXAL3D
        </span>
      </div>

      <div className="ml-auto text-[12px] font-medium text-[#71809a]">
        Image source / Engine controls / GLB export
      </div>
    </nav>
  )
}
