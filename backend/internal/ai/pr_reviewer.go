package ai

import (
	"context"
	"fmt"

	"google.golang.org/genai"
)

type PRReviewer struct {
	client *genai.Client
}

func NewPRReviewer(apiKey string) (*PRReviewer, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{APIKey: apiKey})
	if err != nil {
		return nil, err
	}
	return &PRReviewer{client: client}, nil
}

func (r *PRReviewer) ReviewPRDiff(ctx context.Context, repoFullName string, prNumber int, diff string) (string, error) {
	prompt := fmt.Sprintf(`You are an expert Software Architect acting as an automated GitHub PR reviewer.
Please review the following Pull Request diff for repository %s (PR #%d).

Focus ONLY on the architectural impact of these changes.
Identify any of the following:
1. Introduction of new tight coupling or circular dependencies.
2. Changes to core interfaces or API contracts.
3. Potential security implications or architectural anti-patterns.
4. Large structural additions that lack testing.

If the PR is purely cosmetic, simple bug fixes, or minor features with no architectural impact, output a short message stating: "No significant architectural impact detected. Looks good! 👍"

Format your response as a professional GitHub comment in Markdown. Use bullet points and be concise. Do not explain what a diff is.

Pull Request Diff:
%s
`, repoFullName, prNumber, diff)

	var temp float32 = 0.2
	resp, err := r.client.Models.GenerateContent(ctx, "gemini-3.6-flash", genai.Text(prompt), &genai.GenerateContentConfig{
		Temperature: &temp,
	})

	if err != nil {
		return "", fmt.Errorf("failed to generate PR review: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty response from Gemini")
	}

	return string(resp.Candidates[0].Content.Parts[0].Text), nil
}
