import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { GridBackground } from '@/components/ui/GridBackground';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { ForWho } from '@/components/landing/ForWho';
import { PricingSection } from '@/components/landing/PricingSection';
// Hidden: team reviewing whether efficiency section is needed
// import { EfficiencySection } from '@/components/landing/EfficiencySection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ManagedServices } from '@/components/landing/ManagedServices';
import { FaqSection } from '@/components/landing/FaqSection';
import { Footer } from '@/components/landing/Footer';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LandingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-background text-foreground antialiased overflow-x-hidden">
      {/* Grid Pattern Background */}
      <GridBackground />

      <Header />
      <main className="relative z-10">
        <section>
          <HeroSection />
        </section>
        <section>
          <FeaturesSection />
        </section>
        <section>
          <ForWho />
        </section>
        <section>
          <PricingSection />
        </section>
        {/* Hidden: team reviewing whether efficiency section is needed
        <section>
          <EfficiencySection />
        </section>
        */}
        <section>
          <HowItWorks />
        </section>
        <section>
          <ManagedServices />
        </section>
        <section>
          <FaqSection />
        </section>
      </main>

      <Footer />
    </div>
  );
}
