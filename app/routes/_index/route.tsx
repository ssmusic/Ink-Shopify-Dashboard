import { useRef } from "react";
import { Link, type LoaderFunctionArgs } from "react-router";
import { redirect } from "@remix-run/node";
import { Button } from "../../components/ui/button";
import { ArrowRight, Shield, Film } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Landing() {
  // Add landing-typography class for serif headings on this page only
  const heroRef = useRef<HTMLElement>(null);
  const problemRef = useRef<HTMLElement>(null);
  const valueRef = useRef<HTMLElement>(null);
  const howItWorksRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const quoteRef = useRef<HTMLElement>(null);
  const dropCardsRef = useRef<HTMLElement>(null);

  // Hero: dramatic zoom out and fade as you scroll
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(heroProgress, [0, 1], ["0%", "-40%"]);
  const heroOpacity = useTransform(heroProgress, [0, 1], [1, 1]);

  // Problem section - zoom in from far away
  const { scrollYProgress: problemProgress } = useScroll({
    target: problemRef,
    offset: ["start end", "center center"],
  });
  const problemY = useTransform(problemProgress, [0, 1], [120, 0]);
  const problemScale = useTransform(problemProgress, [0, 1], [0.8, 1]);
  const problemOpacity = useTransform(problemProgress, [0, 0.3, 1], [0, 0.5, 1]);

  // Value cards - dramatic stagger with zoom
  const { scrollYProgress: valueProgress } = useScroll({
    target: valueRef,
    offset: ["start end", "center center"],
  });
  const cardY = useTransform(valueProgress, [0, 1], [150, 0]);
  const cardScale = useTransform(valueProgress, [0, 1], [0.85, 1]);
  const cardOpacity = useTransform(valueProgress, [0, 0.2, 1], [0, 0.3, 1]);

  // How it works - parallax offset
  const { scrollYProgress: howProgress } = useScroll({
    target: howItWorksRef,
    offset: ["start end", "end start"],
  });
  const howY = useTransform(howProgress, [0, 1], [80, -80]);

  // Stats - scale up dramatically
  const { scrollYProgress: statsProgress } = useScroll({
    target: statsRef,
    offset: ["start end", "center center"],
  });
  const statsScale = useTransform(statsProgress, [0, 1], [0.7, 1]);
  const statsOpacity = useTransform(statsProgress, [0, 0.3, 1], [0, 0.5, 1]);

  // ink. Drop hero — same pattern as top hero
  const { scrollYProgress: quoteProgress } = useScroll({
    target: quoteRef,
    offset: ["start start", "end start"],
  });
  const quoteY = useTransform(quoteProgress, [0, 1], ["0%", "-40%"]);
  const quoteOpacity = useTransform(quoteProgress, [0, 1], [1, 1]);

  // Drop cards - aggressive stagger with zoom
  const { scrollYProgress: dropCardsProgress } = useScroll({
    target: dropCardsRef,
    offset: ["start end", "center center"],
  });
  const dropCardY = useTransform(dropCardsProgress, [0, 1], [200, 0]);
  const dropCardScale = useTransform(dropCardsProgress, [0, 1], [0.7, 1]);
  const dropCardOpacity = useTransform(dropCardsProgress, [0, 0.3, 1], [0, 0.2, 1]);

  return (
    <div className="landing-typography min-h-screen bg-warm-white overflow-x-hidden">
      {/* Header */}
      <header className="bg-foreground text-background py-6 px-6 relative z-20">
        <div className="max-w-7xl mx-auto">
          <Link to="/" className="text-2xl font-serif font-medium tracking-tight">
            ink.
          </Link>
        </div>
      </header>

      {/* Hero Section - Sticky, content scrolls over it */}
      <section ref={heroRef} className="relative h-[100vh]">
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="fixed top-0 left-0 right-0 h-screen bg-foreground text-background flex items-center justify-center px-6 will-change-transform origin-center"
        >
          <div className="relative max-w-4xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-sm md:text-base font-serif font-light leading-snug tracking-tight mb-3"
            >
              The delivery verification layer for Shopify.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="text-xs md:text-sm text-white/70 max-w-md mx-auto leading-relaxed mb-10"
            >
              Pre-shipment photos. Branded confirmation on arrival. A verified record bound to the order. Next-gen delivery.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            >
              <Link to="/app">
               <Button className="bg-white text-black hover:bg-gray-100 px-4 py-2 h-auto text-xs uppercase tracking-wider font-medium rounded-none hover:-translate-y-0.5 hover:shadow-lg transition-all">
                  Get Started
                  <ArrowRight className="ml-1.5 h-3 w-3" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* The Problem */}
      <section ref={problemRef} className="bg-warm-white py-24 px-6 relative z-10">
        <motion.div
          style={{ y: problemY, scale: problemScale, opacity: problemOpacity }}
          className="max-w-4xl mx-auto text-center will-change-transform"
        >
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-6 font-medium">The Missing Layer</p>
          <h2 className="text-4xl md:text-5xl font-serif font-light tracking-tight mb-8 leading-tight">
            ink. sits on top of infrastructure already in place.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            The warehouse stays. The carrier stays. The POS stays. No IT integration, no vendor coordination, no workflow changes. Merchants can be running in weeks, not months.
          </p>
        </motion.div>
      </section>

      {/* Two-Sided Value */}
      <section ref={valueRef} className="bg-card py-20 px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <motion.div
            style={{ scale: cardScale, opacity: cardOpacity }}
            className="text-center mb-16 will-change-transform"
          >
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-6 font-medium">What Your Customer Gets</p>
            <h2 className="text-4xl font-serif font-light tracking-tight leading-tight">
              A branded moment on arrival.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-16">
            {/* Advertising Side */}
            <motion.div
              style={{ y: cardY, scale: cardScale, opacity: cardOpacity }}
              className="group will-change-transform"
            >
              <div className="w-14 h-14 bg-foreground flex items-center justify-center mb-8">
                <Film className="h-7 w-7 text-background" />
              </div>
              <h3 className="text-3xl font-serif font-medium mb-5">A Branded Moment on Arrival</h3>
              <p className="text-gray-600 leading-relaxed mb-8 text-lg">
                Phone touches sticker. Your logo, your colors, your message — full screen. No app. No login. One tap and they close their phone and go about their day.
              </p>
              <ul className="space-y-4 text-base">
              </ul>
            </motion.div>

            {/* Fraud Protection Side */}
            <motion.div
              style={{ y: cardY, scale: cardScale, opacity: cardOpacity }}
              transition={{ delay: 0.15 }}
              className="group will-change-transform"
            >
              <div className="w-14 h-14 bg-foreground flex items-center justify-center mb-8">
                <Shield className="h-7 w-7 text-background" />
              </div>
              <h3 className="text-3xl font-serif font-medium mb-5">A Delivery Confirmation They Can Trust</h3>
              <p className="text-gray-600 leading-relaxed mb-8 text-lg">
                On screen: their order is confirmed. In the background, ink. captures GPS, timestamp, and device data. Your customer sees a premium experience. You see verified proof.
              </p>
              <ul className="space-y-4 text-base">
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} className="bg-warm-white py-20 px-6 relative z-10 overflow-hidden">
        <motion.div 
          style={{ y: howY }}
          className="max-w-4xl mx-auto text-center will-change-transform"
        >
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-6 font-medium">What You Get</p>
          <h2 className="text-4xl font-serif font-light tracking-tight mb-16 leading-tight">
            A record of every shipment. Evidence before anything ships. A dashboard that shows you everything.
          </h2>

          <div className="grid md:grid-cols-3 gap-12 text-left">
            {[
              { num: "01", title: "A Record of Every Shipment", desc: "What was in the box. When it was delivered. That your customer received it. Cryptographically signed and timestamped." },
              { num: "02", title: "Evidence Before Anything Ships", desc: "Pre-shipment photos lock what you packed to the sticker's unique ID. The record is created at your warehouse — not reconstructed after a dispute." },
              { num: "03", title: "One Dashboard", desc: "Enrollment status. Tap rates. Time to engagement. Sticker inventory with auto-refill. One view." },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 60, scale: 0.9 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7, delay: i * 0.2 }}
                className="will-change-transform"
              >
                <div className="text-6xl font-serif font-light text-gray-200 mb-4">{step.num}</div>
                <h3 className="text-xl font-serif font-medium mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* The Stakes / Stats */}
      <section ref={statsRef} className="bg-card py-20 px-6 relative z-10 overflow-hidden">
        <motion.div 
          style={{ scale: statsScale, opacity: statsOpacity }}
          className="max-w-4xl mx-auto will-change-transform"
        >
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-6 font-medium">How You Enroll</p>
            <h2 className="text-4xl font-serif font-light tracking-tight">
              Two enrollment methods. Both simple.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 text-center max-w-2xl mx-auto">
            {[
              { value: "Photo", label: "Photograph each item. Apply the sticker. Ship. Maximum documentation for high-value orders. Available now." },
              { value: "High Speed", label: "Scan the order. Scan the sticker. Ship. Two beeps. For volume operations where speed matters. Coming soon." },
            ].map((stat, i) => (
              <motion.div
                key={stat.value}
                initial={{ opacity: 0, scale: 0.5, y: 40 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="p-6 will-change-transform"
              >
                <div className="text-5xl md:text-6xl font-serif font-light mb-2">
                  {stat.value}
                </div>
                <p className="text-gray-500 text-sm">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Enterprise 3PL Section */}
      <section className="bg-secondary text-foreground py-24 px-6 relative z-10 overflow-hidden">
        
        
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <p className="text-xs uppercase tracking-wider text-foreground/40 mb-6 font-medium">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-serif font-light tracking-tight leading-tight mb-8">
              No monthly fee. No tiers. Pay per package.
            </h2>
            <p className="text-lg text-foreground/60 max-w-3xl mx-auto leading-relaxed">
              $0.99 per enrollment · $2.99 per verified tap · $0.80 per sticker
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              {
                title: "Luxury · Beauty · Jewelry",
                desc: "High-value items that deserve documentation before they ship.",
              },
              {
                title: "Electronics · Collectibles",
                desc: "Categories where disputes are costly and proof changes outcomes.",
              },
              {
                title: "High-AOV DTC",
                desc: "Anything worth documenting before it ships.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="border border-border/30 p-8"
              >
                <h3 className="text-xl font-serif font-medium mb-4 text-foreground">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center"
          >
            <Link to="/app">
               <Button className="bg-foreground text-background hover:bg-foreground/90 px-4 py-2 h-auto text-xs uppercase tracking-wider font-medium rounded-none hover:-translate-y-0.5 hover:shadow-lg transition-all">
                 Get Started
                 <ArrowRight className="ml-1.5 h-3 w-3" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ink. Drop Hero — sticky within its section, cards scroll over it */}
      <section ref={quoteRef} className="relative z-10">
        <div className="sticky top-0 h-screen bg-foreground text-background flex items-center justify-center px-6 overflow-hidden">
          <div className="relative max-w-4xl mx-auto text-center">
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ fontSize: '3.75rem' }}
              className="font-serif font-light leading-snug tracking-tight mb-3"
            >
              ink. Drop
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="text-base md:text-lg text-white/70 max-w-lg mx-auto leading-relaxed mb-10"
            >
              The hardware bolt-on that turns every delivery into a retention event.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ink. Drop Cards */}
      <section ref={dropCardsRef} className="bg-secondary py-24 md:py-32 px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            {[
              {
                title: "One Tap at Delivery",
                desc: "That's it. The customer sees a branded confirmation. In the background, ink. pre-authorizes a future return and sends the customer a return link — by email, text, or saved from the confirmation screen.",
              },
              {
                title: "Extended Return Window",
                desc: "Customers who tap get a longer return window than customers who don't. The tap is the incentive. The tap is the unlock.",
              },
              {
                title: "Any Carrier. Any Location.",
                desc: "When the customer is ready to return, they open the link. No sticker needed. The system confirms eligibility. They walk into any FedEx, UPS, or USPS. GPS detects the carrier. A carrier-native QR generates in seconds. The associate scans it through their existing system. No printing. No portal. No receipt.",
              },
              {
                title: "Return Passport",
                desc: "Walk into a retail partner instead? GPS detects the store. A Return Passport generates. No ID. No receipt. Instant verification.",
                badge: "Coming Soon",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 100, scale: 0.85 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.8, delay: i * 0.15, ease: "easeOut" }}
                className="border border-border/30 p-10 will-change-transform hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs text-muted-foreground font-medium tabular-nums">0{i + 1}</span>
                  <h3 className="text-xl md:text-2xl font-serif font-medium">{card.title}</h3>
                  {card.badge && (
                    <span className="text-[10px] uppercase tracking-wider text-foreground/40 border border-foreground/20 px-2 py-0.5 font-medium">
                      {card.badge}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground leading-relaxed text-sm">{card.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-sm text-foreground/40 max-w-2xl mx-auto text-center mt-12"
          >
            Customers who never tap go through your standard return process — single-carrier label, standard return window. The tap is the unlock.
          </motion.p>
        </div>
      </section>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="bg-foreground text-white/60 py-10 px-6 relative z-10"
      >
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-6 text-xs uppercase tracking-wider">
            <Link to="/app/help" className="hover:text-white transition-colors">Support</Link>
            <span>·</span>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <span>·</span>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
          <p className="mt-6 text-xs">© 2026 ink.</p>
        </div>
      </motion.footer>
    </div>
  );
}
