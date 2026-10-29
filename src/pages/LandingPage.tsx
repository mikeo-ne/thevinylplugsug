import { Hero } from '../components/landing/Hero';
import { Marquee } from '../components/landing/Marquee';
import { Configurator } from '../components/landing/Configurator';
import { Process } from '../components/landing/Process';
import { Plants } from '../components/landing/Plants';
import { RecentPressings } from '../components/landing/RecentPressings';
import { Faq } from '../components/landing/Faq';
import { CtaBand } from '../components/landing/CtaBand';

export function LandingPage() {
  return (
    <main>
      <Hero />
      <Marquee />
      <Configurator />
      <Process />
      <Plants />
      <RecentPressings />
      <Faq />
      <CtaBand />
    </main>
  );
}
