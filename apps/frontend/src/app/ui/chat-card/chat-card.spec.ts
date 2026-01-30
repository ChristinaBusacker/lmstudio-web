import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatCard } from './chat-card';

describe('ChatCard', () => {
  let component: ChatCard;
  let fixture: ComponentFixture<ChatCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
