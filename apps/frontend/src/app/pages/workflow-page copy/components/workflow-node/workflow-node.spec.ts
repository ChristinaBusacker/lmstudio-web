import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowNode } from './workflow-node';

describe('WorkflowNode', () => {
  let component: WorkflowNode;
  let fixture: ComponentFixture<WorkflowNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowNode]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowNode);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
