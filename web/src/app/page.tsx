import { Chrome } from "../components/landing/Chrome";
import { Developers } from "../components/landing/Developers";
import { Exposure } from "../components/landing/Exposure";
import { Faq } from "../components/landing/Faq";
import { FinalCta } from "../components/landing/FinalCta";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { Pricing } from "../components/landing/Pricing";
import { ProblemStatement } from "../components/landing/ProblemStatement";
import { ProductSuite } from "../components/landing/ProductSuite";
import { Solution } from "../components/landing/Solution";
import { Steps } from "../components/landing/Steps";
import { TrustModel } from "../components/landing/TrustModel";
import { UnderTheHood } from "../components/landing/UnderTheHood";
import { Users } from "../components/landing/Users";

export default function Home() {
  return (
    <Chrome>
      <main id="main-content" className="overflow-x-clip">
        <Hero />
        <ProblemStatement />
        <Exposure />
        <Solution />
        <ProductSuite />
        <Steps />
        <TrustModel />
        <Pricing />
        <Users />
        <Developers />
        <UnderTheHood />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </Chrome>
  );
}
