import { Layout } from "@/components/layout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
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
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Smartphone,
  Gift
} from "lucide-react";
import { motion } from "framer-motion";

export default function HowToPlay() {
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
              <span className="text-4xl">⚽</span>
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter text-white">
              HOW TO <span className="text-primary">PLAY</span>
            </h1>
            <p className="text-muted-foreground font-medium max-w-[280px]">
              Master the pitch and score big with the world's first Telegram football casino.
            </p>
          </motion.div>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {/* Section 2: What is STRIKER? */}
          <AccordionItem value="what-is-striker" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <CircleDollarSign className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">What is STRIKER?</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
              <p className="mb-3">
                <strong className="text-foreground">STRIKER (STRK)</strong> is our exclusive in-game token used for all bets and rewards.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="bg-muted p-3 rounded-xl border border-border/50 text-center">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-1">Deposit Rate</div>
                  <div className="text-foreground font-mono font-bold">1 TON = 100 STRK</div>
                </div>
                <div className="bg-muted p-3 rounded-xl border border-border/50 text-center">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-1">Withdraw Rate</div>
                  <div className="text-foreground font-mono font-bold">110 STRK = 1 TON</div>
                </div>
              </div>
              <p className="text-xs italic">STRK has a fixed peg to TON with a small spread to support platform liquidity and jackpot pools.</p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3: How to Deposit */}
          <AccordionItem value="deposit" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#f59e0b]">
                <Wallet className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">How to Deposit</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4">
              <div className="space-y-4 pt-2">
                {[
                  { step: 1, text: "Tap the Wallet icon in the bottom navigation bar." },
                  { step: 2, text: "Enter the amount of TON you wish to deposit." },
                  { step: 3, text: "Click 'Deposit' to create an invoice via CryptoBot." },
                  { step: 4, text: "Complete the payment directly within Telegram." },
                  { step: 5, text: "STRIKER tokens are credited to your balance automatically!" }
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {item.step}
                    </div>
                    <p className="text-sm font-medium">{item.text}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4: Games Guide */}
          <AccordionItem value="games" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <Gamepad2 className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Games Guide</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <div className="grid grid-cols-1 gap-4">
                <GameCard 
                  title="THE SHOT (Crash)" 
                  desc="Ball flies and multiplier grows. Cash out before it crashes. Last-second cashouts win big!"
                  color="#00ff88"
                  accent="bg-[#00ff88]/10"
                />
                <GameCard 
                  title="PENALTY" 
                  desc="Choose left/center/right. 1.92× payout if keeper dives the wrong way."
                  color="#3b82f6"
                  accent="bg-[#3b82f6]/10"
                />
                <GameCard 
                  title="FREE KICK (Plinko)" 
                  desc="Ball drops through pegs. Low risk: smaller swings. High risk: big wins or big losses."
                  color="#f59e0b"
                  accent="bg-[#f59e0b]/10"
                />
                <GameCard 
                  title="MINEFIELD" 
                  desc="Click safe squares on a 5×5 grid. Cash out before hitting a mine. More safe squares = higher multiplier."
                  color="#ef4444"
                  accent="bg-[#ef4444]/10"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5: VIP Tiers */}
          <AccordionItem value="vip" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#f59e0b]">
                <Trophy className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">VIP Tiers</span>
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
                    <TierRow name="Championship" cashback="2%" min="100 TON" />
                    <TierRow name="Premier League" cashback="4%" min="500 TON" />
                    <TierRow name="Champions League" cashback="7%" min="2,500 TON" />
                    <TierRow name="World Cup" cashback="10%" min="10,000 TON" />
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground italic px-1">
                * Cashback is calculated on net losses and paid out weekly. Minimum wagering requirements apply for each tier level.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 6: Withdrawals */}
          <AccordionItem value="withdrawals" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <ShieldCheck className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Withdrawals</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 space-y-3">
              <div className="flex items-start gap-3 bg-muted/50 p-3 rounded-xl">
                <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm">Minimum withdrawal is <strong className="text-foreground">100 STRIKER</strong>.</p>
              </div>
              <p className="text-sm px-1">
                Withdrawals are processed manually by our team for security reasons. Standard processing time is <strong className="text-foreground">~24 hours</strong>.
              </p>
              <div className="flex items-start gap-3 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                <Smartphone className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-200">
                  <strong className="text-white">CRITICAL:</strong> You must have a <strong className="text-white">@username</strong> set in your Telegram profile to receive payments.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 7: Referrals */}
          <AccordionItem value="referrals" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-[#f59e0b]">
                <Users className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Referrals</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 space-y-4">
              <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-transparent p-4 border border-primary/20">
                <div className="relative z-10">
                  <h4 className="text-foreground font-bold mb-1">Refer & Earn 5%</h4>
                  <p className="text-sm">Share your unique referral link found on the Profile page.</p>
                  <p className="text-sm mt-2 text-primary font-bold italic">
                    Earn 5% of your friend's first deposit as STRIKER tokens instantly!
                  </p>
                </div>
                <TrendingUp className="absolute right-[-10px] bottom-[-10px] w-24 h-24 text-primary/10 -rotate-12" />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 8: Jackpot */}
          <AccordionItem value="jackpot" className="border-none bg-card rounded-2xl px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3 text-primary">
                <Zap className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Golden Boot Jackpot</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 space-y-3">
              <p className="text-sm px-1">
                The <strong className="text-foreground">Golden Boot Jackpot</strong> is a community-wide prize pool that grows with every single bet placed on the platform.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted p-3 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Contribution</div>
                  <div className="text-primary font-bold">0.5% per bet</div>
                </div>
                <div className="bg-muted p-3 rounded-xl text-center">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Trigger Threshold</div>
                  <div className="text-primary font-bold">50 TON</div>
                </div>
              </div>
              <p className="text-xs italic bg-primary/5 p-3 rounded-xl border border-primary/10">
                Once the pool reaches 50 TON, it is randomly awarded to an eligible player who has been active in the last 60 minutes. Every bet is a chance to win!
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Support Link/Footer */}
        <div className="mt-4 flex flex-col items-center gap-4 py-6 border-t border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
            <Gift className="w-4 h-4" />
            <span>Good luck, Striker!</span>
          </div>
          <p className="text-[10px] text-muted-foreground text-center max-w-[240px] uppercase tracking-[0.2em] font-bold opacity-50">
            StrikerX Telegram Web App v2.4.0
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
