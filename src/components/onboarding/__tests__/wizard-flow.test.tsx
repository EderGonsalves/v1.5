import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { vi } from "vitest";

import { WizardContainer } from "../WizardContainer";

vi.mock("axios", () => ({
  default: {
    post: vi.fn((url: string) => {
      if (typeof url === "string" && url.includes("login-v2")) {
        return Promise.resolve({
          data: [
            {
              code: "LOGIN_SUCCESS",
              result: {
                payload: {
                  institution_id: 42,
                },
              },
            },
          ],
        });
      }

      return Promise.resolve({ data: { tenantId: "tenant-123" } });
    }),
  },
}));

type AxiosMock = {
  post: ReturnType<typeof vi.fn>;
};

const mockedAxios = axios as unknown as AxiosMock;

describe("WizardContainer", () => {
  it("permite concluir o fluxo completo e enviar os dados", async () => {
    render(<WizardContainer />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/e-mail corporativo/i), "user@ria.com");
    await user.type(screen.getByLabelText(/senha/i), "senha-segura");
    await user.click(screen.getByRole("button", { name: /entrar e continuar/i }));

    const companyNameField = await screen.findByLabelText(/nome do escrit/i);

    await user.type(companyNameField, "Acme LTDA");
    await user.type(screen.getByLabelText(/horários de atendimento/i), "8h - 18h");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await user.type(screen.getByLabelText(/rua/i), "Rua Central, 100");
    await user.type(screen.getByLabelText(/cidade/i), "São Paulo");
    await user.type(screen.getByLabelText(/estado/i), "SP");
    await user.type(screen.getByLabelText(/cep/i), "01001-000");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await user.type(screen.getByLabelText(/agente orquestrador/i), "Assistente RIA");
    await user.selectOptions(
      screen.getByLabelText(/idioma principal/i),
      "Inglês (EUA)",
    );
    await user.type(
      screen.getByLabelText(/descrição da personalidade/i),
      "Você é uma especialista digital que guia o cliente com empatia.",
    );
    await user.type(
      screen.getByLabelText(/área de expertise/i),
      "Direito previdenciário com foco em BPC/LOAS.",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await user.type(screen.getByLabelText(/saudação inicial/i), "Oi, sou o agente da Acme!");
    await user.type(screen.getByLabelText(/frase de despedida/i), "Obrigado por falar conosco!");
    await user.type(screen.getByLabelText(/palavras proibidas/i), "cancelamento, atraso");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await user.click(screen.getByRole("button", { name: /continuar/i }));

    const submitButton = await screen.findByRole("button", {
      name: /finalizar cadastro/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    expect(
      screen.getByText(/Tudo certo! Compartilhamos o fluxo configurado/i),
    ).toBeInTheDocument();
  }, 10000);
});
