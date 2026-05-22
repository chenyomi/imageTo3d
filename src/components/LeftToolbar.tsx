import { ImageIcon, Box, Scissors, RefreshCw, Layers, Activity, ChevronDown } from 'lucide-react'

interface Props {
  activeTool: string
  onToolChange: (tool: string) => void
}

const tools = [
  { id: 'image', label: 'Image', icon: ImageIcon, badge: 'GPT Image 2' },
  { id: 'model', label: 'Model', icon: Box },
  { id: 'segment', label: 'Segment', icon: Scissors, hasArrow: true },
  { id: 'retopo', label: 'Retopo', icon: RefreshCw },
  { id: 'texture', label: 'Texture', icon: Layers, hasArrow: true },
  { id: 'animate', label: 'Animate', icon: Activity },
]

export default function LeftToolbar({ activeTool, onToolChange }: Props) {
  return (
    <div className="w-14 bg-[#161618] border-r border-[#2a2a2d] flex flex-col items-center pt-2 pb-2 gap-0.5 flex-shrink-0 z-10">
      {tools.map((tool) => {
        const Icon = tool.icon
        const isActive = activeTool === tool.id
        return (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            className={`relative flex flex-col items-center justify-center w-12 rounded-lg transition-all select-none ${
              tool.badge ? 'h-[58px]' : 'h-[52px]'
            } ${
              isActive
                ? 'bg-[#2a2a2d] text-white'
                : 'text-[#555558] hover:text-gray-300 hover:bg-[#1e1e20]'
            }`}
          >
            {/* GPT badge */}
            {tool.badge && (
              <span className="absolute top-1.5 left-1 right-1 text-[7px] bg-sky-600 text-white rounded px-0.5 text-center leading-[10px] py-[2px] font-medium">
                {tool.badge}
              </span>
            )}

            <Icon size={17} className={tool.badge ? 'mt-4' : ''} />
            <span className="text-[10px] mt-0.5 leading-tight">{tool.label}</span>

            {/* submenu arrow */}
            {tool.hasArrow && (
              <ChevronDown size={9} className="absolute bottom-1 opacity-50" />
            )}
          </button>
        )
      })}
    </div>
  )
}
