import { Layout } from "@/components/layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Wallet,
  Gamepad2,
  Users,
  Coins,
  CircleDollarSign,
  Target,
  Zap,
  Info,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Gift,
  Bot,
  FlaskConical,
  ArrowUpDown,
  BarChart2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export default function HowToPlay() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="flex flex-col gap-6 p-4 pb-12 bg-[#060a14] min-h-full">
        {/* Hero Section */}
        <div className="text-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <BarChart2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter text-white">
              StrikerX <span className="text-primary">Guide</span>
            </h1>
            <p className="text-muted-foreground font-medium max-w-[280px]">
              Binary prediction trading · Casino games · Earn crypto
            </p>
          </motion.div>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="binary-trading">

          {/* Section 1: Binary Trading — PRIMARY */}
          <AccordionItem value="binary-trading" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <ArrowUpDown className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Binary Trading</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4">
              <p className="text-sm mb-4">
                Predict whether an asset price will go <span className="text-green-400 font-bold">UP</span> or{" "}
                <span className="text-red-400 font-bold">DOWN</span> within a set time window. Win{" "}
                <span className="text-primary font-bold">82% payout</span> on every correct prediction.
              </p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-muted/60 p-3 rounded-xl border border-border/50">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-primary mb-1.5">UP / DOWN</div>
                  <p className="text-xs">Predict whether the price rises or falls by expiry. The most common contract type.</p>
                </div>
                <div className="bg-muted/60 p-3 rounded-xl border border-border/50">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-blue-400 mb-1.5">EVEN / ODD</div>
                  <p className="text-xs">Predict whether the last digit of the price is even or odd at expiry.</p>
                </div>
                <div className="bg-muted/60 p-3 rounded-xl border border-border/50">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-violet-400 mb-1.5">OVER / UNDER</div>
                  <p className="text-xs">Predict whether the last digit is 5 or above (OVER) or below 5 (UNDER).</p>
                </div>
                <div className="bg-muted/60 p-3 rounded-xl border border-border/50">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-teal-400 mb-1.5">IN / OUT</div>
                  <p className="text-xs">Predict whether price stays inside or breaks outside a barrier range by expiry.</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60 mb-2">Available Assets</p>
                <div className="flex flex-wrap gap-1.5">
                  {["BTC/USD", "ETH/USD", "SOL/USD", "EUR/USD", "GBP/USD", "XAU/USD", "WTI Oil", "Natural Gas"].map(a => (
                    <span key={a} className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted border border-border/50">{a}</span>
                  ))}
                </div>
              </div>

              <div className="bg-green-500/8 border border-green-500/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-bold text-white">Win Streak Bonus</span>
                </div>
                <p className="text-xs">Every consecutive win adds a payout boost. Chain 5+ wins for maximum multiplier.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2: AI Trader */}
          <AccordionItem value="ai-trader" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-violet-400">
                <Bot className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">AI Signal &amp; Auto-Trader</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4">
              <div className="space-y-3">
                <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl p-3">
                  <p className="text-xs font-bold text-white mb-1">AI Signal</p>
                  <p className="text-xs">
                    The trading terminal shows a real-time AI signal for every asset — direction (UP/DOWN/NEUTRAL),
                    confidence score, and reasoning powered by Groq AI. The signal updates automatically on each
                    asset switch and refreshes every minute.
                  </p>
                </div>
                <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl p-3">
                  <p className="text-xs font-bold text-white mb-1">Auto-Trader</p>
                  <p className="text-xs">
                    Enable the Auto-Trader from your Account page. Choose a risk preset (Conservative / Balanced / Aggressive),
                    select your preferred assets and contract duration, and the AI will place trades automatically on your behalf
                    using your STRIKER balance when high-confidence signals appear.
                  </p>
                </div>
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-200">
                    Auto-Trader signals use live price data and momentum analysis. Past signal accuracy does not guarantee
                    future results. Trade responsibly.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3: Demo Mode */}
          <AccordionItem value="demo" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#26a17b]">
                <FlaskConical className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Demo Mode (Practice)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4">
              <p className="text-sm mb-3">
                Practice trading with <span className="text-[#26a17b] font-bold">10,000 demo USDT</span> — no real money at risk.
                Toggle Demo Mode using the flask icon in the trading terminal header.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>All contract types and assets are available in demo mode</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>Win/loss outcomes use the same real-time price feed as live trading</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>Demo balance resets to 10,000 USDT when depleted</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                  <span className="text-muted-foreground/60">Demo trades do not count toward VIP progress or streak bonuses</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4: What is STRIKER? */}
          <AccordionItem value="what-is-striker" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <CircleDollarSign className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.whatIsStriker")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
              <p className="mb-3">
                <strong className="text-foreground">STRIKER (STRK)</strong> is the platform token used for casino games and bonus rewards.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="bg-muted p-3 rounded-xl border border-border/50 text-center">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-1">Deposit Rate</div>
                  <div className="text-foreground font-mono font-bold">100 STRK / TON</div>
                </div>
                <div className="bg-muted p-3 rounded-xl border border-border/50 text-center">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-1">Withdraw Rate</div>
                  <div className="text-foreground font-mono font-bold">110 STRK / TON</div>
                </div>
              </div>
              <p className="text-xs italic">TON and USDT are used directly for binary trading without conversion.</p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5: How to Deposit */}
          <AccordionItem value="deposit" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#f59e0b]">
                <Wallet className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.howToDeposit")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4">
              <div className="space-y-4 pt-2">
                {[
                  "Go to the Deposit tab and select TON, USDT, BNB, or SOL.",
                  "Enter an amount (minimum 5 TON or equivalent) and tap Generate Invoice.",
                  "Pay the CryptoBot invoice in your Telegram wallet — it expires in 1 hour.",
                  "Your balance updates instantly once the transaction confirms on-chain.",
                  "Bonus: During Rate Events, deposit rates increase temporarily for extra STRIKER.",
                ].map((text, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    <p className="text-sm font-medium">{text}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 6: Games Guide */}
          <AccordionItem value="games" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <Gamepad2 className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.gamesGuide")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="grid grid-cols-1 gap-4">
                <GameCard title="THE SHOT (Crash)" desc={t("guide.games.shot")} color="#00ff88" accent="bg-[#00ff88]/10" />
                <GameCard title="PENALTY" desc={t("guide.games.penalty")} color="#3b82f6" accent="bg-[#3b82f6]/10" />
                <GameCard title="FREE KICK (Plinko)" desc={t("guide.games.freekick")} color="#f59e0b" accent="bg-[#f59e0b]/10" />
                <GameCard title="MINEFIELD" desc={t("guide.games.minefield")} color="#ef4444" accent="bg-[#ef4444]/10" />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 7: VIP Tiers */}
          <AccordionItem value="vip" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#f59e0b]">
                <Trophy className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.vipTiers")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold uppercase text-[10px]">Tier</th>
                      <th className="px-3 py-2 text-center font-bold uppercase text-[10px]">Cashback</th>
                      <th className="px-3 py-2 text-right font-bold uppercase text-[10px]">Min Wager</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <TierRow name="Sunday League" cashback="1%" min="0 TON" />
                    <TierRow name="Championship" cashback="2%" min="10 TON" />
                    <TierRow name="Premier League" cashback="4%" min="50 TON" />
                    <TierRow name="Champions League" cashback="7%" min="200 TON" />
                    <TierRow name="World Cup" cashback="10%" min="1,000 TON" />
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground italic px-1">
                * Cashback is distributed weekly based on your total wagered volume.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 8: Withdrawals */}
          <AccordionItem value="withdrawals" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <ShieldCheck className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.withdrawals")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 space-y-3">
              <div className="flex items-start gap-3 bg-muted/50 p-3 rounded-xl">
                <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm">Minimum withdrawal is 2 TON. Funds are sent to your CryptoBot wallet within 24 hours after admin review.</p>
              </div>
              <p className="text-sm px-1">Submit a withdrawal request from the Withdraw tab. STRIKER tokens convert to TON at the 110 STRK/TON rate.</p>
              <div className="flex items-start gap-3 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-200">Double-check your wallet address before submitting — withdrawals to incorrect addresses cannot be reversed.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 9: Referrals */}
          <AccordionItem value="referrals" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#f59e0b]">
                <Users className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.referrals")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 space-y-4">
              <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-transparent p-4 border border-primary/20">
                <div className="relative z-10">
                  <h4 className="text-foreground font-bold mb-1">Earn Lifetime Commission</h4>
                  <p className="text-sm">Share your referral link and earn a percentage of every trade your referrals place — forever.</p>
                  <p className="text-sm mt-2 text-primary font-bold italic">Copy your link from the Account page and share it anywhere.</p>
                </div>
                <TrendingUp className="absolute right-[-10px] bottom-[-10px] w-24 h-24 text-primary/10 -rotate-12" />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 10: Jackpot */}
          <AccordionItem value="jackpot" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <Zap className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">{t("guide.jackpotTitle")}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 space-y-3">
              <p className="text-sm px-1">Every trade contributes 0.5% of its stake to a growing jackpot pool. When the pool exceeds the threshold, it randomly triggers on a winning trade.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted p-3 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Contribution</div>
                  <div className="text-primary font-bold">0.5% per bet</div>
                </div>
                <div className="bg-muted p-3 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Min Trigger</div>
                  <div className="text-primary font-bold">50 TON</div>
                </div>
              </div>
              <p className="text-xs italic bg-primary/5 p-3 rounded-xl border border-primary/10">
                Only real-money trades qualify for the jackpot. Demo trades are excluded.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>

        {/* Footer */}
        <div className="mt-4 flex flex-col items-center gap-4 py-6 border-t border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
            <Gift className="w-4 h-4" />
            <span>Good luck and trade smart!</span>
          </div>
          <p className="text-[10px] text-muted-foreground text-center max-w-[240px] uppercase tracking-[0.2em] font-bold opacity-50">
            StrikerX Telegram Web App v2.5.0
          </p>
        </div>
      </div>
    </Layout>
  );
}

function GameCard({ title, desc, color, accent }: { title: string; desc: string; color: string; accent: string }) {
  return (
    <div className={`p-4 rounded-xl border border-border/50 ${accent} transition-all active:scale-[0.98]`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-black italic tracking-tighter text-sm" style={{ color }}>{title}</h4>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed font-medium">
        {desc}
      </p>
    </div>
  );
}

function TierRow({ name, cashback, min }: { name: string; cashback: string; min: string }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-3 py-3 font-medium text-foreground">{name}</td>
      <td className="px-3 py-3 text-center">
        <Badge variant="outline" className="text-primary border-primary/30 text-[10px] font-bold bg-primary/5">
          {cashback}
        </Badge>
      </td>
      <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
        {min}
      </td>
    </tr>
  );
}
