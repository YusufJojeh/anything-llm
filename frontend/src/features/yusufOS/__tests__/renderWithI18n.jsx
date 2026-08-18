import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { registerYusufOSTranslations } from "../i18n";

registerYusufOSTranslations();

/**
 * Renders a Yusuf OS component with the real i18n instance and the real
 * router. Nothing is stubbed that the product depends on for meaning — a
 * status label that only passes because translation was mocked would prove
 * nothing about what an operator sees.
 */
export function renderWithI18n(ui, { language = "en", route = "/os" } = {}) {
  i18n.changeLanguage(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </I18nextProvider>
  );
}

export { i18n };
