import { useRef } from "react";
import { Link } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { ArrowRight, Shield, Film } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { authenticate } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const problemRef = useRef<HTMLElement>(null);
  const valueRef = useRef<HTMLElement>(null);
  const howItWorksRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const quoteRef = useRef<HTMLElement>(null);

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

  // Quote - zoom in from small
  const { scrollYProgress: quoteProgress } = useScroll({
    target: quoteRef,
    offset: ["start end", "center center"],
  });
  const quoteScale = useTransform(quoteProgress, [0, 1], [0.6, 1]);
  const quoteOpacity = useTransform(quoteProgress, [0, 0.4, 1], [0, 0.5, 1]);

  return (
    <div className="landing-typography" style={{ minHeight: "100vh", background: "#FAF9F6", overflowX: "hidden" }}>
      {/* Header */}
      <header style={{ backgroundColor: "#000", color: "#fff", padding: "24px", position: "relative", zIndex: 20 }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <span style={{ fontSize: "1.5rem", fontFamily: "'Playfair Display', serif", fontWeight: 500, letterSpacing: "-0.02em" }}>
            ink.
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <section ref={heroRef} style={{ position: "relative", height: "100vh" }}>
        <motion.div
          style={{
            y: heroY,
            opacity: heroOpacity,
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "100vh",
            backgroundColor: "#000",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            willChange: "transform",
          }}
        >
          {/* Decorative Gold Blur Orbs */}
          <div style={{
            position: "absolute", top: "50%", left: "25%",
            transform: "translate(-50%, -50%)",
            width: "384px", height: "384px",
            backgroundColor: "#D4AF37", borderRadius: "50%",
            filter: "blur(96px)", opacity: 0.1,
          }} />
          <div style={{
            position: "absolute", top: "50%", right: "25%",
            transform: "translate(50%, -50%)",
            width: "384px", height: "384px",
            backgroundColor: "#D4AF37", borderRadius: "50%",
            filter: "blur(96px)", opacity: 0.1,
          }} />

          <div style={{ position: "relative", maxWidth: "896px", margin: "0 auto", textAlign: "center" }}>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{
                fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
                fontWeight: 300,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: "32px",
              }}
            >
              Advertising that arrives.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              style={{
                fontSize: "clamp(1rem, 2vw, 1.5rem)",
                color: "rgba(255,255,255,0.7)",
                maxWidth: "672px",
                margin: "0 auto 48px",
                lineHeight: 1.6,
              }}
            >
              Turn every delivery into a branded moment—and make friendly fraud impossible with cryptographic proof.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            >
              <Link
                to="/app/dashboard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#fff",
                  color: "#000",
                  padding: "16px 40px",
                  fontSize: "14px",
                  fontWeight: 500,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase" as const,
                  textDecoration: "none",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Get Started
                <ArrowRight style={{ width: 16, height: 16 }} />
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* The Problem */}
      <section ref={problemRef} style={{ backgroundColor: "#FAF9F6", padding: "96px 24px", position: "relative", zIndex: 10 }}>
        <motion.div
          style={{ y: problemY, scale: problemScale, opacity: problemOpacity, willChange: "transform" }}
        >
          <div style={{ maxWidth: "896px", margin: "0 auto", textAlign: "center" }}>
            <p style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: "24px", fontWeight: 500 }}>
              The Last Mile Problem
            </p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", fontWeight: 300, letterSpacing: "-0.02em", marginBottom: "32px", lineHeight: 1.15 }}>
              Your brand disappears the moment you ship.
            </h2>
            <p style={{ fontSize: "1.125rem", color: "#666", lineHeight: 1.7, maxWidth: "672px", margin: "0 auto" }}>
              A brown box. A porch. A signature that could be anyone's. No story. No connection. No proof it even arrived.
              Meanwhile, chargebacks cost you <span style={{ color: "#D4AF37", fontWeight: 500 }}>$3.75 for every $1 disputed</span>.
            </p>
          </div>
        </motion.div>
      </section>

      {/* Two-Sided Value */}
      <section ref={valueRef} style={{ backgroundColor: "#fff", padding: "80px 24px", position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
          <motion.div
            style={{ scale: cardScale, opacity: cardOpacity, willChange: "transform" }}
          >
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <p style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: "24px", fontWeight: 500 }}>
                One Tag, Two Wins
              </p>
              <h2 style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                Brand the moment. Lock the record.
              </h2>
            </div>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))", gap: "64px" }}>
            {/* Advertising Side */}
            <motion.div style={{ y: cardY, scale: cardScale, opacity: cardOpacity, willChange: "transform" }}>
              <div style={{ width: 56, height: 56, backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
                <Film style={{ width: 28, height: 28, color: "#fff" }} />
              </div>
              <h3 style={{ fontSize: "1.875rem", fontWeight: 500, marginBottom: 20 }}>Logistics-Based Advertising</h3>
              <p style={{ color: "#666", lineHeight: 1.7, marginBottom: 32, fontSize: "1.125rem" }}>
                Your customer taps the NFC tag. Your branded video plays full-screen. No app download. No friction. A guaranteed brand moment at the moment of delivery.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {[
                  "Custom loading screen with your branding",
                  "Branded video that tells your story",
                  "Highest-attention moment in the journey",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 16, color: "#666", marginBottom: 16, fontSize: "1rem" }}>
                    <span style={{ width: 8, height: 8, backgroundColor: "#D4AF37", borderRadius: "50%", flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Fraud Protection Side */}
            <motion.div style={{ y: cardY, scale: cardScale, opacity: cardOpacity, willChange: "transform" }}>
              <div style={{ width: 56, height: 56, backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
                <Shield style={{ width: 28, height: 28, color: "#fff" }} />
              </div>
              <h3 style={{ fontSize: "1.875rem", fontWeight: 500, marginBottom: 20 }}>Irrefutable Delivery Record</h3>
              <p style={{ color: "#666", lineHeight: 1.7, marginBottom: 32, fontSize: "1.125rem" }}>
                That same tap creates a timestamped, GPS-verified, cryptographically-sealed record—your customer's{" "}
                <span style={{ color: "#000", fontWeight: 500 }}>return passport</span>. Proof of who bought what, perfect for in-store returns on online purchases.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {[
                  "Verifiable proof of purchase for hassle-free returns",
                  "GPS coordinates + SHA-256 hashed photos",
                  "Win every chargeback dispute",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 16, color: "#666", marginBottom: 16, fontSize: "1rem" }}>
                    <span style={{ width: 8, height: 8, backgroundColor: "#D4AF37", borderRadius: "50%", flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} style={{ backgroundColor: "#FAF9F6", padding: "80px 24px", position: "relative", zIndex: 10, overflow: "hidden" }}>
        <motion.div style={{ y: howY, willChange: "transform" }}>
          <div style={{ maxWidth: "896px", margin: "0 auto", textAlign: "center" }}>
            <p style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: "24px", fontWeight: 500 }}>
              How It Works
            </p>
            <h2 style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 300, letterSpacing: "-0.02em", marginBottom: "64px", lineHeight: 1.15 }}>
              Three steps. Zero friction.
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: "48px", textAlign: "left" }}>
              {[
                { num: "01", title: "Enroll & Ship", desc: "Photograph the contents of your shipment. Attach the NFC tag to the outside. SHA-256 locks the record before it leaves your hands." },
                { num: "02", title: "Customer Taps", desc: "No app needed. Phone touches tag. Your advertisement plays while GPS is captured. Timestamp logged." },
                { num: "03", title: "An End to Friendly Fraud", desc: "Your pre-shipment photos exist whether or not the customer taps—cryptographic proof of condition and contents. Friendly fraud becomes impossible." },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 60, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.7, delay: i * 0.2 }}
                  style={{ willChange: "transform" }}
                >
                  <div style={{ fontSize: "3.75rem", fontFamily: "'Playfair Display', serif", fontWeight: 300, color: "#e5e5e5", marginBottom: 16 }}>
                    {step.num}
                  </div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: 12 }}>{step.title}</h3>
                  <p style={{ color: "#666", lineHeight: 1.7 }}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* The Stakes / Stats */}
      <section ref={statsRef} style={{ backgroundColor: "#fff", padding: "80px 24px", position: "relative", zIndex: 10, overflow: "hidden" }}>
        <motion.div style={{ scale: statsScale, opacity: statsOpacity, willChange: "transform" }}>
          <div style={{ maxWidth: "896px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <p style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: "24px", fontWeight: 500 }}>
                The Math
              </p>
              <h2 style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 300, letterSpacing: "-0.02em" }}>
                Friendly fraud is eating your margins.
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "32px", textAlign: "center", maxWidth: "672px", margin: "0 auto" }}>
              {[
                { value: "86%", label: "of chargebacks are friendly fraud" },
                { value: "$3.75", label: "lost for every $1 disputed" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.value}
                  initial={{ opacity: 0, scale: 0.5, y: 40 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: i * 0.15 }}
                  style={{ padding: 24, willChange: "transform" }}
                >
                  <div style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", fontFamily: "'Playfair Display', serif", fontWeight: 300, marginBottom: 32 }}>
                    {stat.value}
                  </div>
                  <p style={{ color: "#999", fontSize: "14px" }}>{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Enterprise 3PL Section */}
      <section style={{ backgroundColor: "#000", color: "#fff", padding: "96px 24px", position: "relative", zIndex: 10, overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "50%", left: "33%",
          transform: "translate(-50%, -50%)",
          width: "500px", height: "500px",
          backgroundColor: "#D4AF37", borderRadius: "50%",
          filter: "blur(120px)", opacity: 0.07,
        }} />

        <div style={{ maxWidth: "1120px", margin: "0 auto", position: "relative" }}>
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            style={{ textAlign: "center", marginBottom: "64px" }}
          >
            <p style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "24px", fontWeight: 500 }}>
              Enterprise 3PL
            </p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: "32px" }}>
              The proof primitive that's been missing.
            </h2>
            <p style={{ fontSize: "1.125rem", color: "rgba(255,255,255,0.6)", maxWidth: "768px", margin: "0 auto", lineHeight: 1.7 }}>
              Carriers log deliveries. Retailers track orders. But no one captures the moment itself. INK creates a cryptographically sealed record at the point of physical handoff—not inference, not reconstruction. Event-level verification that travels with the transaction.
            </p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "32px", marginBottom: "64px" }}>
            {[
              {
                title: "Proof of Possession",
                desc: "Someone physically had the package. At a specific time. At a specific location. With the package intact. Carriers don't provide this. Retailers don't control this.",
              },
              {
                title: "Proof of Contents",
                desc: "This exact order contained these items, was accepted back into the system, at this store, at this time. Captured at the moment of truth—not inferred after the fact.",
              },
              {
                title: "Proof of Custody",
                desc: "Tamper-resistant, cross-party, event-linked, portable proof. The difference between 'our system says' and 'we can prove.' That matters in disputes, insurance, and compliance.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                style={{ border: "1px solid rgba(255,255,255,0.1)", padding: 32 }}
              >
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: 16, color: "#fff" }}>{item.title}</h3>
                <p style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.7, fontSize: "14px" }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ textAlign: "center" }}
          >
            <Link
              to="/app/help"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#fff",
                color: "#000",
                padding: "16px 40px",
                fontSize: "14px",
                fontWeight: 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
                textDecoration: "none",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Partner With Us
              <ArrowRight style={{ width: 16, height: 16 }} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Visual Break - Quote */}
      <section ref={quoteRef} style={{ backgroundColor: "#FAF9F6", padding: "128px 24px", position: "relative", zIndex: 10, overflow: "hidden" }}>
        <motion.div
          style={{ scale: quoteScale, opacity: quoteOpacity, willChange: "transform" }}
        >
          <div style={{ maxWidth: "896px", margin: "0 auto", textAlign: "center" }}>
            <blockquote style={{
              fontSize: "clamp(1.5rem, 4vw, 3.25rem)",
              fontFamily: "'Playfair Display', serif",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              fontStyle: "italic",
              color: "rgba(0,0,0,0.8)",
              margin: 0,
              padding: 0,
              border: "none",
            }}>
              "INK transforms the last touchpoint of the online shopping experience into your most memorable."
            </blockquote>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{ backgroundColor: "#000", color: "rgba(255,255,255,0.6)", padding: "40px 24px", position: "relative", zIndex: 10 }}
      >
        <div style={{ maxWidth: "1280px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            <Link to="/app/help" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            >Support</Link>
            <span>·</span>
            <a href="#" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            >Privacy</a>
            <span>·</span>
            <a href="#" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            >Terms</a>
          </div>
          <p style={{ marginTop: 24, fontSize: "12px" }}>© 2026 INK. All rights reserved.</p>
        </div>
      </motion.footer>
    </div>
  );
}