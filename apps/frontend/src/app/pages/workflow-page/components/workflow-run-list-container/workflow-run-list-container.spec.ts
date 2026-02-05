import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowRunListContainer } from './workflow-run-list-container';

describe('WorkflowRunListContainer', () => {
  let component: WorkflowRunListContainer;
  let fixture: ComponentFixture<WorkflowRunListContainer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowRunListContainer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowRunListContainer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
