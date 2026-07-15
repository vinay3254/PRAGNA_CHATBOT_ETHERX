import { motion } from 'framer-motion'

const SuggestionCard = ({ icon: Icon, title, description }) => {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className="group relative flex flex-col items-start gap-3 p-5 rounded-2xl text-left
        bg-black border border-accent-500/[.18]
        shadow-premium-sm hover:shadow-premium-hover hover:border-accent-500/40
        transition-colors duration-300"
    >
      <div className="w-[38px] h-[38px] rounded-[11px] bg-accent-500/[.12] border border-accent-500/25 flex items-center justify-center">
        <Icon size={18} className="text-accent-500" />
      </div>
      <h3 className="text-[15px] font-[650] text-[var(--pragna-text)]">
        {title}
      </h3>
      <p className="text-[13px] leading-[1.45] text-[var(--pragna-text-muted)]">{description}</p>
    </motion.button>
  )
}

export default SuggestionCard
