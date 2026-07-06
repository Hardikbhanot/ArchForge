import { Component, Input, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../../core/services/ai.service';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.css']
})
export class AiChatComponent implements AfterViewChecked {
  @Input() projectId: string | null = null;
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  isOpen = false;
  isLoading = false;
  userInput = '';
  messages: ChatMessage[] = [];

  constructor(private aiService: AiService) {}

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen && this.messages.length === 0) {
      this.messages.push({
        role: 'ai',
        content: 'Hi! I am ArchForge AI. Ask me anything about the architecture of this codebase.'
      });
    }
  }

  sendMessage() {
    if (!this.userInput.trim() || !this.projectId || this.isLoading) return;

    const message = this.userInput.trim();
    this.messages.push({ role: 'user', content: message });
    this.userInput = '';
    this.isLoading = true;

    this.aiService.sendMessage(this.projectId, message).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.error) {
          this.messages.push({ role: 'ai', content: `Error: ${res.error}` });
        } else {
          this.messages.push({ role: 'ai', content: res.answer });
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.messages.push({ role: 'ai', content: 'Sorry, I encountered a network error while trying to answer.' });
        console.error(err);
      }
    });
  }

  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}
